import { v4 as uuid } from 'uuid'
import { createConsoleLogComponent } from '@well-known-components/logger'
import { isFeatureFlagEnabled } from '../utils/features'
import { isTPCollection } from '../utils/urn'
import { env } from 'decentraland-commons'
import { Collection } from '../Collection/Collection.model'
import { CollectionAttributes } from '../Collection/Collection.types'
import { Item } from '../Item/Item.model'
import { ItemAttributes } from '../Item/Item.types'
import { VIDEO_PATH } from '../Item/utils'
import { sanitizeItemContents } from '../Item/sanitize'
import { buildEntityMetadata, calculateItemContentHash } from '../Item/hashes'
import { collectionAPI } from '../ethereum/api/collection'
import { curationNotifications } from './notifications'
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

const logger = createConsoleLogComponent().getLogger('AutoCuration')
let warnedMissingTopic = false

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
    }
  }

  /**
   * Changes hook: the items whose content differs from what is on chain, including the ones the chain holds no
   * content hash for. Items not on chain yet have no URN, so the validator cannot judge them. Never throws.
   */
  async onChangesSubmitted(collectionId: string): Promise<void> {
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
          changedItems.push(item)
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
      await curationNotifications.validationNotRequested(collection.id, reason)
    }
  }
}
