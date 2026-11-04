import { v4 as uuid } from 'uuid'
import { createConsoleLogComponent } from '@well-known-components/logger'
import { isFeatureFlagEnabled } from '../utils/features'
import { isTPCollection } from '../utils/urn'
import { env } from 'decentraland-commons'
import { Collection } from '../Collection/Collection.model'
import { CollectionAttributes } from '../Collection/Collection.types'
import { Item } from '../Item/Item.model'
import { ItemAttributes, ItemContents } from '../Item/Item.types'
import { VIDEO_PATH } from '../Item/utils'
import { isValidContentEntry, sanitizeItemContents } from '../Item/sanitize'
import { buildEntityMetadata, calculateItemContentHash } from '../Item/hashes'
import { collectionAPI } from '../ethereum/api/collection'
import { curationNotifications } from './notifications'
import { CurationService } from './Curation.service'
import { CurationStatus, CurationType } from './Curation.types'
import {
  requestValidation as publishValidationRequest,
  ValidationTooLargeError,
} from './validationQueue'
import {
  ValidationManifest,
  ValidationManifestItem,
  ValidationTrigger,
} from './AutoCuration.types'

// Resolved by isFeatureFlagEnabled as `builder-auto-curation`.
export const AUTO_CURATION_FEATURE_FLAG = 'auto-curation'

// The Builder saves an item before uploading the files it points to, and creators often save several times in a
// row: a collection's changed items are validated once they went this long without another change.
export const ITEM_CHANGES_DELAY_MS = 60 * 1000
// The shortest time between two validations of a collection's item changes; the changes made in between are validated
// together when it ends. It caps what one collection being edited costs (model calls, a Slack thread or notice each
// time) at 6 validations an hour, while a curator still gets a verdict for the latest files within minutes.
export const MIN_ITEM_CHANGES_INTERVAL_MS = 10 * 60 * 1000

const logger = createConsoleLogComponent().getLogger('AutoCuration')
let warnedMissingTopic = false

type PendingItemChanges = {
  timer: ReturnType<typeof setTimeout>
  // The files each changed item had before its first change in the window, keyed by item id.
  filesBefore: Map<string, string>
}

// Per process, shared by every instance: each router and service builds its own.
const pendingItemChanges = new Map<string, PendingItemChanges>()
// Bumped whenever a collection's item changes are dropped, so that a validation already being prepared is not sent.
// One number per collection whose review was requested since the process started.
const itemChangesGenerations = new Map<string, number>()
// When each collection's item changes were last sent to be validated, while that is within the minimum interval.
const lastItemChangesValidations = new Map<string, number>()

/** Forgets every waiting item change, generation and interval. For tests: suites share this module's state. */
export function resetPendingItemChanges(): void {
  for (const { timer } of pendingItemChanges.values()) {
    clearTimeout(timer)
  }
  pendingItemChanges.clear()
  itemChangesGenerations.clear()
  lastItemChangesValidations.clear()
}

function getItemChangesGeneration(collectionId: string): number {
  return itemChangesGenerations.get(collectionId) ?? 0
}

/** How long until the collection's item changes may be validated again: 0 when the minimum interval went by. */
function getItemChangesCooldown(collectionId: string): number {
  const lastValidation = lastItemChangesValidations.get(collectionId)
  if (lastValidation === undefined) {
    return 0
  }
  const cooldown = lastValidation + MIN_ITEM_CHANGES_INTERVAL_MS - Date.now()
  if (cooldown <= 0) {
    lastItemChangesValidations.delete(collectionId)
    return 0
  }
  return cooldown
}

/** The files the validator receives, comparable as a string: no video, no empty files or directories, any order. */
function getFilesKey(contents: ItemContents | null | undefined): string {
  return JSON.stringify(
    Object.entries(contents ?? {})
      .filter(
        ([path, hash]) => path !== VIDEO_PATH && isValidContentEntry(path, hash)
      )
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  )
}

/**
 * Sends standard collections to the wearable-validator job. The job posts its findings to the curators' Slack
 * channel and calls back `/collections/:id/validation-result`; nothing is stored here yet.
 */
export class AutoCurationService {
  /** The flag, as long as there is a topic to publish on: without one every trigger would only alert curators. */
  async isEnabled(): Promise<boolean> {
    if (!(await isFeatureFlagEnabled(AUTO_CURATION_FEATURE_FLAG))) {
      return false
    }
    if (!env.get('AWS_SNS_ARN', '')) {
      if (!warnedMissingTopic) {
        warnedMissingTopic = true
        logger.warn(
          'The auto curation flag is on but AWS_SNS_ARN is not set: no validation will be requested'
        )
      }
      return false
    }
    return true
  }

  /**
   * Publish hook: every item of a standard collection on its first publication. The items are read again
   * because the publication just stored their blockchain ids, which their URNs need. Never throws.
   */
  async onStandardCollectionPublished(
    collection: CollectionAttributes
  ): Promise<void> {
    try {
      if (isTPCollection(collection) || !(await this.isEnabled())) {
        return
      }
      const items = await Item.findOrderedByCollectionId(collection.id)
      await this.startValidation(collection, items, 'publish')
    } catch (error) {
      logger.error(
        `Error requesting the validation of the published collection ${
          collection.id
        }: ${(error as Error).message}`
      )
      await this.handOffToCurators(collection.id)
    }
  }

  /**
   * Changes hook: the items whose content differs from what is on chain, including the ones the chain holds no
   * content hash for. Items not on chain yet have no URN, so the validator cannot judge them. Never throws.
   */
  async onChangesSubmitted(collectionId: string): Promise<void> {
    // This validation covers every changed item, including the saved ones still waiting for their own.
    this.cancelItemChanges(collectionId)
    try {
      if (!(await this.isEnabled())) {
        return
      }
      const collection = await Collection.findOne<CollectionAttributes>(
        collectionId
      )
      if (
        !collection ||
        isTPCollection(collection) ||
        !collection.contract_address
      ) {
        return
      }

      const [items, remoteItems] = await Promise.all([
        Item.findOrderedByCollectionId(collectionId),
        collectionAPI.fetchItemsByContractAddress(collection.contract_address),
      ])
      const remoteContentHashes = new Map(
        remoteItems.map((remoteItem) => [
          remoteItem.blockchainId,
          remoteItem.contentHash,
        ])
      )
      // The stored hash is only computed when an item is saved after its publication, so an item untouched
      // since then has none and is hashed here.
      const changedItems: ItemAttributes[] = []
      for (const item of items) {
        if (item.blockchain_item_id === null) {
          continue
        }
        const localHash =
          item.local_content_hash ??
          (await calculateItemContentHash(item, collection))
        if (remoteContentHashes.get(item.blockchain_item_id) !== localHash) {
          // The hash computed here is reused by the manifest.
          changedItems.push({ ...item, local_content_hash: localHash })
        }
      }
      if (changedItems.length === 0) {
        logger.info(
          `No changed items to validate in collection ${collectionId}`
        )
        return
      }

      await this.startValidation(collection, changedItems, 'changes')
    } catch (error) {
      logger.error(
        `Error requesting the validation of the changes of collection ${collectionId}: ${
          (error as Error).message
        }`
      )
      await this.handOffToCurators(collectionId)
    }
  }

  /**
   * Item hook: an item of a published standard collection was saved. When its files changed, the collection's
   * changed items are validated once its saves settle (ITEM_CHANGES_DELAY_MS without another change) and at least
   * MIN_ITEM_CHANGES_INTERVAL_MS after the previous validation of its item changes, if the collection is under
   * review by then. Items not on chain yet have no URN and are skipped. Never throws.
   */
  onItemSaved(
    previous: ItemAttributes,
    saved: ItemAttributes,
    collection: CollectionAttributes
  ): void {
    try {
      if (
        isTPCollection(collection) ||
        !collection.contract_address ||
        saved.blockchain_item_id === null
      ) {
        return
      }
      const filesBefore = getFilesKey(previous.contents)
      if (filesBefore === getFilesKey(saved.contents)) {
        return
      }

      const changes =
        pendingItemChanges.get(collection.id)?.filesBefore ??
        new Map<string, string>()
      if (!changes.has(saved.id)) {
        changes.set(saved.id, filesBefore)
      }
      this.scheduleItemChanges(
        collection.id,
        changes,
        Math.max(ITEM_CHANGES_DELAY_MS, getItemChangesCooldown(collection.id))
      )
      logger.info(
        `The files of item ${saved.id} changed: collection ${collection.id} waits for its saves to settle`
      )
    } catch (error) {
      logger.error(
        `Error scheduling the validation of item ${saved?.id}: ${
          (error as Error).message
        }`
      )
    }
  }

  /**
   * Drops the saved item changes that wait to be validated, including the ones whose validation is being prepared,
   * as a validation of every changed item covers them.
   */
  cancelItemChanges(collectionId: string): void {
    const pending = pendingItemChanges.get(collectionId)
    if (pending) {
      clearTimeout(pending.timer)
      pendingItemChanges.delete(collectionId)
    }
    itemChangesGenerations.set(
      collectionId,
      getItemChangesGeneration(collectionId) + 1
    )
  }

  /**
   * The items whose files changed in the window, read again so that the last save is the one validated, when the
   * collection is still under review. An item whose files went back to the ones it had is not sent. Never throws.
   */
  async onItemChangesSettled(
    collectionId: string,
    filesBefore: Map<string, string>
  ): Promise<void> {
    const generation = getItemChangesGeneration(collectionId)
    try {
      if (!(await this.isEnabled())) {
        return
      }
      const collection = await Collection.findOne<CollectionAttributes>(
        collectionId
      )
      if (
        !collection ||
        isTPCollection(collection) ||
        !collection.contract_address
      ) {
        return
      }
      if (!(await this.isUnderReview(collection))) {
        logger.info(
          `Collection ${collectionId} is not under review: its changed items are validated when its creator pushes them`
        )
        return
      }

      const items = await Item.findOrderedByCollectionId(collectionId)
      const changedItems = items.filter(
        (item) =>
          item.blockchain_item_id !== null &&
          filesBefore.has(item.id) &&
          filesBefore.get(item.id) !== getFilesKey(item.contents)
      )
      if (changedItems.length === 0) {
        logger.info(
          `The changed items of collection ${collectionId} went back to their previous files`
        )
        return
      }

      if (getItemChangesGeneration(collectionId) !== generation) {
        logger.info(
          `The changed items of collection ${collectionId} were dropped while their validation was prepared`
        )
        return
      }

      // Also when the request fails: a collection too large to validate would post a notice on every window.
      lastItemChangesValidations.set(collectionId, Date.now())
      await this.startValidation(collection, changedItems, 'edit')
    } catch (error) {
      logger.error(
        `Error requesting the validation of the changed items of collection ${collectionId}: ${
          (error as Error).message
        }`
      )
      await this.handOffToCurators(collectionId)
    }
  }

  async buildManifest(
    validationId: string,
    collection: CollectionAttributes,
    items: ItemAttributes[]
  ): Promise<ValidationManifest> {
    const manifestItems: ValidationManifestItem[] = []

    for (const item of items) {
      const cleanItem = sanitizeItemContents(item)
      const contents: Record<string, string> = {}
      for (const [path, hash] of Object.entries(cleanItem.contents)) {
        if (path !== VIDEO_PATH) {
          contents[path] = hash
        }
      }

      manifestItems.push({
        itemId: item.id,
        contentHash:
          item.local_content_hash ??
          (await calculateItemContentHash(item, collection)),
        metadata: buildEntityMetadata(cleanItem, collection),
        contents,
      })
    }

    return { validationId, collectionId: collection.id, items: manifestItems }
  }

  /** (Re)starts the wait of a collection's item changes; when it ends, they are validated unless the interval says no. */
  private scheduleItemChanges(
    collectionId: string,
    filesBefore: Map<string, string>,
    delay: number
  ): void {
    const pending = pendingItemChanges.get(collectionId)
    if (pending) {
      clearTimeout(pending.timer)
    }
    const timer = setTimeout(() => {
      // A validation of the collection's item changes may have gone out while these waited.
      const cooldown = getItemChangesCooldown(collectionId)
      if (cooldown > 0) {
        this.scheduleItemChanges(collectionId, filesBefore, cooldown)
        return
      }
      pendingItemChanges.delete(collectionId)
      void this.onItemChangesSettled(collectionId, filesBefore)
    }, delay)
    // A validation waiting for more changes must not keep the process alive.
    timer.unref?.()
    pendingItemChanges.set(collectionId, { timer, filesBefore })
  }

  /**
   * Whether the curators review the collection as it is now: it has a pending curation, or it was never approved on
   * chain and waits for its first review whatever its curations say (the Builder shows it as under review and offers
   * no way to request one). An approved collection without a pending curation is not: its creator pushes the changes,
   * which requests their validation.
   */
  private async isUnderReview(
    collection: CollectionAttributes
  ): Promise<boolean> {
    const curation = await CurationService.byType(
      CurationType.COLLECTION
    ).getLatestById(collection.id)
    if (curation?.status === CurationStatus.PENDING) {
      return true
    }
    const remoteCollection = await collectionAPI.fetchCollection(
      collection.contract_address!
    )
    return !!remoteCollection && !remoteCollection.isApproved
  }

  /** A request that cannot be sent is handed to the curators: no automatic result will reach their channel. */
  private async startValidation(
    collection: CollectionAttributes,
    items: ItemAttributes[],
    trigger: ValidationTrigger
  ): Promise<void> {
    const validationId = uuid()
    try {
      await publishValidationRequest(
        await this.buildManifest(validationId, collection, items)
      )
    } catch (error) {
      const reason =
        error instanceof ValidationTooLargeError
          ? `it is too large for the automatic review (${error.itemCount} items, ${error.bytes} bytes)`
          : 'the automatic review could not be requested'
      logger.error(
        `The validation ${validationId} (${trigger}) of collection ${
          collection.id
        } was not sent: ${(error as Error).message}`
      )
      await this.handOffToCurators(collection.id, reason)
    }
  }

  /** Never throws: the notification is best effort and the hooks must not surface an error twice. */
  private async handOffToCurators(
    collectionId: string,
    reason = 'the automatic review could not be requested'
  ): Promise<void> {
    try {
      await curationNotifications.validationNotRequested(collectionId, reason)
    } catch (error) {
      logger.error(
        `Error telling the curators about collection ${collectionId}: ${
          (error as Error).message
        }`
      )
    }
  }
}
