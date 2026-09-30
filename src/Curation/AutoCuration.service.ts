import { v4 as uuid } from 'uuid'
import { env, utils } from 'decentraland-commons'
import { isFeatureFlagEnabled } from '../utils/features'
import { isTPCollection } from '../utils/urn'
import { Collection } from '../Collection/Collection.model'
import { CollectionAttributes } from '../Collection/Collection.types'
import { Item } from '../Item/Item.model'
import { ItemAttributes } from '../Item/Item.types'
import { VIDEO_PATH } from '../Item/utils'
import { sanitizeItemContents } from '../Item/sanitize'
import { buildEntityMetadata, calculateItemContentHash } from '../Item/hashes'
import { collectionAPI } from '../ethereum/api/collection'
import {
  CollectionCuration,
  CollectionCurationAttributes,
} from './CollectionCuration'
import {
  CollectionEvent,
  CollectionEventActor,
  CollectionEventAttributes,
  CollectionEventType,
  SWEEP_EXHAUSTED_REASON,
} from './CollectionEvent'
import { CurationStatus } from './Curation.types'
import { sendValidation } from './ccsClient'
import { escapeSlackText, notifyCurationSlack } from './slack'
import {
  CollectionEventsPage,
  MAX_VALIDATION_ATTEMPTS_PER_DAY,
  ValidationManifest,
  ValidationManifestItem,
  ValidationResult,
  ValidationTrigger,
} from './AutoCuration.types'
import {
  AppealAlreadyOpenError,
  CurationNotRejectedError,
  MissingCurationError,
  NotStandardCollectionError,
  ValidationInProgressError,
  ValidationLimitReachedError,
} from './AutoCuration.errors'

// Resolved by isFeatureFlagEnabled as `builder-auto-curation`.
export const AUTO_CURATION_FEATURE_FLAG = 'auto-curation'
export const STALE_VALIDATION_MS = 30 * 60 * 1000
export const MAX_SWEEP_RESENDS = 10
export const VALIDATOR_REVIEWER = 'validator'

const DAY_MS = 24 * 60 * 60 * 1000
const VERDICT_EVENT_TYPES: string[] = [
  CollectionEventType.REVIEW_AI_PASSED,
  CollectionEventType.REVIEW_AI_REJECTED,
]
const HUMAN_DECISION_EVENT_TYPES: string[] = [
  CollectionEventType.REVIEW_APPROVED,
  CollectionEventType.REVIEW_REJECTED,
]

export function getStartOfTodayUTC(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
}

/** Counts AI verdicts since the latest human decision. Expects the day's events newest first. */
export function countValidationAttempts(
  eventsNewestFirst: CollectionEventAttributes[]
): number {
  let attempts = 0
  for (const event of eventsNewestFirst) {
    if (HUMAN_DECISION_EVENT_TYPES.includes(event.type)) {
      break
    }
    if (VERDICT_EVENT_TYPES.includes(event.type)) {
      attempts++
    }
  }
  return attempts
}

export function redactCollectionEvent(
  event: CollectionEventAttributes
): CollectionEventAttributes {
  if (!event.type.startsWith('review.ai_')) {
    return event
  }
  return { ...event, payload: utils.omit(event.payload, ['validationId']) }
}

export class AutoCurationService {
  isEnabled(): Promise<boolean> {
    return isFeatureFlagEnabled(AUTO_CURATION_FEATURE_FLAG)
  }

  /** Publish hook for standard collections. Never throws: the publication already happened. */
  async onStandardCollectionPublished(
    collection: CollectionAttributes,
    ethAddress: string
  ): Promise<void> {
    try {
      // The Builder calls /publish more than once per publication; one validation per publish is enough.
      if (await this.isValidationInProgress(collection.id)) {
        return
      }

      const latestCuration = await CollectionCuration.findLatestByCollectionId(
        collection.id
      )
      if (!latestCuration || latestCuration.status !== CurationStatus.PENDING) {
        await this.createPendingCuration(collection.id)
      }

      await CollectionEvent.record({
        collection_id: collection.id,
        type: CollectionEventType.COLLECTION_PUBLISHED,
        actor: CollectionEventActor.CREATOR,
        actor_address: ethAddress.toLowerCase(),
        payload: {},
      })

      const items = await Item.findOrderedByCollectionId(collection.id)
      await this.startValidation(collection, items, 'publish')
    } catch (error) {
      console.error(
        `Error starting the auto curation of collection ${collection.id}`,
        (error as Error).message
      )
    }
  }

  /** Publish hook for Third Party collections. Never throws: the publication already happened. */
  async onThirdPartyCollectionPublished(
    collection: CollectionAttributes
  ): Promise<void> {
    try {
      await CollectionEvent.record({
        collection_id: collection.id,
        type: CollectionEventType.REVIEW_HUMAN_REQUIRED,
        actor: CollectionEventActor.SYSTEM,
        actor_address: null,
        payload: { reason: 'third_party' },
      })
      await notifyCurationSlack(
        `Third Party collection ${describeCollection(
          collection
        )} was published and needs a curator review.`
      )
    } catch (error) {
      console.error(
        `Error recording the human review request of collection ${collection.id}`,
        (error as Error).message
      )
    }
  }

  /** Changes hook. Validates only the items whose local hash differs from the one on chain. Never throws: the curation already exists. */
  async onChangesSubmitted(
    collectionId: string,
    ethAddress: string
  ): Promise<void> {
    try {
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
      const changedItems = items.filter(
        (item) =>
          item.blockchain_item_id !== null &&
          remoteContentHashes.get(item.blockchain_item_id) !==
            item.local_content_hash
      )

      await CollectionEvent.record({
        collection_id: collectionId,
        type: CollectionEventType.CHANGES_SUBMITTED,
        actor: CollectionEventActor.CREATOR,
        actor_address: ethAddress.toLowerCase(),
        payload: { itemIds: changedItems.map((item) => item.id) },
      })

      if (changedItems.length === 0) {
        return
      }
      if (await this.isValidationInProgress(collectionId)) {
        console.warn(
          `Not validating the changes of collection ${collectionId}: a validation is in progress`
        )
        return
      }
      if (await this.getDailyLimitRetryAt(collectionId)) {
        console.warn(
          `Not validating the changes of collection ${collectionId}: the daily limit was reached`
        )
        return
      }

      await this.startValidation(collection, changedItems, 'changes')
    } catch (error) {
      console.error(
        `Error starting the validation of the changes of collection ${collectionId}`,
        (error as Error).message
      )
    }
  }

  async requestValidation(
    collectionId: string,
    ethAddress: string
  ): Promise<CollectionEventAttributes> {
    const collection = await this.getStandardCollection(collectionId)

    if (await this.isValidationInProgress(collectionId)) {
      throw new ValidationInProgressError(collectionId)
    }

    const retryAt = await this.getDailyLimitRetryAt(collectionId)
    if (retryAt) {
      throw new ValidationLimitReachedError(collectionId, retryAt)
    }

    const latestCuration = await CollectionCuration.findLatestByCollectionId(
      collectionId
    )
    if (!latestCuration) {
      throw new MissingCurationError(collectionId)
    }
    if (latestCuration.status === CurationStatus.REJECTED) {
      await this.createPendingCuration(collectionId)
    }

    const items = await this.findItemsToRevalidate(
      collection,
      await CollectionEvent.findLatestByCollectionIdAndType(
        collectionId,
        CollectionEventType.REVIEW_AI_STARTED
      )
    )
    return this.startValidation(collection, items, 'retry', ethAddress)
  }

  async appeal(
    collectionId: string,
    ethAddress: string,
    note: string
  ): Promise<CollectionCurationAttributes> {
    const latestEvent = await CollectionEvent.findLatestByCollectionId(
      collectionId
    )
    if (latestEvent?.type === CollectionEventType.REVIEW_APPEAL_REQUESTED) {
      throw new AppealAlreadyOpenError(collectionId)
    }

    const latestCuration = await CollectionCuration.findLatestByCollectionId(
      collectionId
    )
    if (!latestCuration || latestCuration.status !== CurationStatus.REJECTED) {
      throw new CurationNotRejectedError(collectionId)
    }

    const curation = await this.createPendingCuration(collectionId)
    await CollectionEvent.record({
      collection_id: collectionId,
      type: CollectionEventType.REVIEW_APPEAL_REQUESTED,
      actor: CollectionEventActor.CREATOR,
      actor_address: ethAddress.toLowerCase(),
      payload: { note },
    })

    const collection = await Collection.findOne<CollectionAttributes>(
      collectionId
    )
    await notifyCurationSlack(
      `Human review requested for collection ${describeCollection(
        collection,
        collectionId
      )}.\nNote: ${escapeSlackText(note)}`
    )

    return curation
  }

  /** Applies a validator callback. Results for anything but the latest validation, or already recorded, are ignored. */
  async handleValidationResult(
    collectionId: string,
    result: ValidationResult
  ): Promise<void> {
    const latestStart = await CollectionEvent.findLatestByCollectionIdAndType(
      collectionId,
      CollectionEventType.REVIEW_AI_STARTED
    )
    if (
      !latestStart ||
      latestStart.payload.validationId !== result.validationId
    ) {
      console.warn(
        `Ignoring the validation result ${result.validationId} for collection ${collectionId}: it is not the latest validation`
      )
      return
    }
    if (
      await CollectionEvent.findVerdictByValidationId(
        collectionId,
        result.validationId
      )
    ) {
      console.warn(
        `Ignoring the validation result ${result.validationId} for collection ${collectionId}: it was already recorded`
      )
      return
    }

    const collection = await Collection.findOne<CollectionAttributes>(
      collectionId
    )
    const event = {
      collection_id: collectionId,
      actor: CollectionEventActor.VALIDATOR,
      actor_address: null,
      payload: result,
    }

    switch (result.verdict) {
      case 'passed': {
        await CollectionEvent.record({
          ...event,
          type: CollectionEventType.REVIEW_AI_PASSED,
        })
        await notifyCurationSlack(
          `AI review passed for collection ${describeCollection(
            collection,
            collectionId
          )}. It is ready for a curator approval.`
        )
        break
      }
      case 'rejected': {
        const latestCuration = await CollectionCuration.findLatestByCollectionId(
          collectionId
        )
        if (
          latestCuration &&
          latestCuration.status === CurationStatus.PENDING
        ) {
          await CollectionCuration.update<CollectionCurationAttributes>(
            {
              status: CurationStatus.REJECTED,
              reviewed_by: VALIDATOR_REVIEWER,
              updated_at: new Date(),
            },
            { id: latestCuration.id }
          )
        }
        await CollectionEvent.record({
          ...event,
          type: CollectionEventType.REVIEW_AI_REJECTED,
        })
        break
      }
      case 'error': {
        await CollectionEvent.record({
          ...event,
          type: CollectionEventType.REVIEW_AI_ERROR,
        })
        await notifyCurationSlack(
          `AI review failed for collection ${describeCollection(
            collection,
            collectionId
          )} (validation ${
            result.validationId
          }). It will be re-sent automatically.`
        )
        break
      }
    }
  }

  async getEvents(
    collectionId: string,
    page: number,
    limit: number,
    canSeeValidationIds: boolean
  ): Promise<CollectionEventsPage<CollectionEventAttributes>> {
    const rows = await CollectionEvent.findPageByCollectionId(
      collectionId,
      limit,
      limit * (page - 1)
    )
    const total = Number(rows[0]?.total_count ?? 0)
    const results = rows.map((row) => {
      const event = utils.omit<CollectionEventAttributes>(row, ['total_count'])
      return canSeeValidationIds ? event : redactCollectionEvent(event)
    })

    return { results, total, page, limit }
  }

  /** Re-sends validations whose start is older than the stale threshold and got no verdict. */
  async sweepStaleValidations(): Promise<void> {
    if (!(await this.isEnabled())) {
      return
    }

    const staleStarts = await CollectionEvent.findStaleAiStarted(
      new Date(Date.now() - STALE_VALIDATION_MS)
    )

    for (const staleStart of staleStarts) {
      try {
        const collection = await Collection.findOne<CollectionAttributes>(
          staleStart.collection_id
        )
        if (!collection || isTPCollection(collection)) {
          continue
        }

        const sweepStarts = await CollectionEvent.countSweepStartsSinceManualStart(
          collection.id
        )
        if (sweepStarts >= MAX_SWEEP_RESENDS) {
          await this.giveUpValidation(collection, staleStart)
          continue
        }

        const items = await this.findItemsToRevalidate(collection, staleStart)
        await this.startValidation(collection, items, 'sweep')
      } catch (error) {
        console.error(
          `Error re-sending the validation of collection ${staleStart.collection_id}`,
          (error as Error).message
        )
      }
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

  private async startValidation(
    collection: CollectionAttributes,
    items: ItemAttributes[],
    trigger: ValidationTrigger,
    ethAddress: string | null = null
  ): Promise<CollectionEventAttributes> {
    const validationId = uuid()
    const event = await CollectionEvent.record({
      collection_id: collection.id,
      type: CollectionEventType.REVIEW_AI_STARTED,
      actor: CollectionEventActor.VALIDATOR,
      actor_address: ethAddress ? ethAddress.toLowerCase() : null,
      payload: { validationId, trigger, itemIds: items.map((item) => item.id) },
    })

    try {
      await sendValidation(
        await this.buildManifest(validationId, collection, items)
      )
    } catch (error) {
      // The start is already recorded, so the sweep re-sends it later.
      console.error(
        `Error sending the validation ${validationId} of collection ${collection.id}`,
        (error as Error).message
      )
    }

    return event
  }

  /** Stops the sweep for a collection: the error event keeps it out of the stale query until someone acts on it. */
  private async giveUpValidation(
    collection: CollectionAttributes,
    staleStart: CollectionEventAttributes
  ): Promise<void> {
    const validationId = staleStart.payload.validationId
    await CollectionEvent.record({
      collection_id: collection.id,
      type: CollectionEventType.REVIEW_AI_ERROR,
      actor: CollectionEventActor.VALIDATOR,
      actor_address: null,
      payload: { reason: SWEEP_EXHAUSTED_REASON, validationId },
    })
    await notifyCurationSlack(
      `AI review of collection ${describeCollection(
        collection
      )} got no verdict after ${MAX_SWEEP_RESENDS} re-sends (validation ${validationId}). It needs a curator or a creator retry.`
    )
  }

  /** A validation is in progress while its latest start has no verdict, whatever was recorded after it. */
  private async isValidationInProgress(collectionId: string): Promise<boolean> {
    const latestStart = await CollectionEvent.findLatestByCollectionIdAndType(
      collectionId,
      CollectionEventType.REVIEW_AI_STARTED
    )
    if (!latestStart) {
      return false
    }
    const verdict = await CollectionEvent.findVerdictByValidationId(
      collectionId,
      latestStart.payload.validationId as string
    )
    return !verdict
  }

  /** Returns when validations are allowed again if the daily limit was reached, null otherwise. */
  private async getDailyLimitRetryAt(
    collectionId: string
  ): Promise<Date | null> {
    const startOfToday = getStartOfTodayUTC()
    const todaysEvents = await CollectionEvent.findByCollectionIdSince(
      collectionId,
      startOfToday
    )
    return countValidationAttempts(todaysEvents) >=
      MAX_VALIDATION_ATTEMPTS_PER_DAY
      ? new Date(startOfToday.getTime() + DAY_MS)
      : null
  }

  /** A re-run validates the same items the previous run did, or everything if there is no previous run. */
  private async findItemsToRevalidate(
    collection: CollectionAttributes,
    previousStart?: CollectionEventAttributes
  ): Promise<ItemAttributes[]> {
    const itemIds = previousStart?.payload.itemIds
    if (Array.isArray(itemIds) && itemIds.length > 0) {
      return Item.findByIds(itemIds)
    }
    return Item.findOrderedByCollectionId(collection.id)
  }

  private async getStandardCollection(
    collectionId: string
  ): Promise<CollectionAttributes> {
    const collection = await Collection.findOne<CollectionAttributes>(
      collectionId
    )
    if (!collection || isTPCollection(collection)) {
      throw new NotStandardCollectionError(collectionId)
    }
    return collection
  }

  private createPendingCuration(
    collectionId: string
  ): Promise<CollectionCurationAttributes> {
    const now = new Date()
    return CollectionCuration.create<CollectionCurationAttributes>({
      id: uuid(),
      collection_id: collectionId,
      status: CurationStatus.PENDING,
      assignee: null,
      reviewed_by: null,
      rejection_reasons: null,
      rejection_message: null,
      created_at: now,
      updated_at: now,
    })
  }
}

function describeCollection(
  collection: CollectionAttributes | undefined,
  collectionId = collection?.id ?? ''
): string {
  const builderUrl = env.get('BUILDER_URL', '')
  const name = collection ? `"${escapeSlackText(collection.name)}" ` : ''
  return `${name}(${collectionId}) ${builderUrl}/collections/${collectionId}`
}
