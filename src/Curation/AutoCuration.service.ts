import { v4 as uuid } from 'uuid'
import { createConsoleLogComponent } from '@well-known-components/logger'
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
  PUBLISH_FAILED_REASON,
  SWEEP_EXHAUSTED_REASON,
  TOO_LARGE_REASON,
} from './CollectionEvent'
import { CurationStatus } from './Curation.types'
import { curationNotifications } from './notifications'
import {
  requestValidation as publishValidationRequest,
  ValidationTooLargeError,
} from './validationQueue'
import { escapeSlackText, notifyCurationSlack } from './slack'
import { withCollectionLock } from './collectionLock'
import {
  CollectionEventsPage,
  MAX_VALIDATION_ATTEMPTS_PER_DAY,
  UNSUPPORTED_VALIDATION_REASON,
  ValidationManifest,
  ValidationManifestItem,
  ValidationResult,
  ValidationTrigger,
} from './AutoCuration.types'
import {
  AppealAlreadyOpenError,
  CurationNotRejectedError,
  CurationRejectedByCuratorError,
  NothingToRevalidateError,
  NotStandardCollectionError,
  ValidationInProgressError,
  ValidationLimitReachedError,
} from './AutoCuration.errors'

// Resolved by isFeatureFlagEnabled as `builder-auto-curation`.
export const AUTO_CURATION_FEATURE_FLAG = 'auto-curation'
// A job may hold a collection for up to 55 minutes and SQS redelivers it after 30, so a start is lost only well after that.
export const STALE_VALIDATION_MS = 2 * 60 * 60 * 1000
export const SWEEP_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
// Each re-send renders the whole collection again.
export const MAX_SWEEP_RESENDS = 3
export const VALIDATOR_REVIEWER = 'validator'

const DAY_MS = 24 * 60 * 60 * 1000
const HUMAN_DECISION_EVENT_TYPES: string[] = [
  CollectionEventType.REVIEW_APPROVED,
  CollectionEventType.REVIEW_REJECTED,
]

const logger = createConsoleLogComponent().getLogger('AutoCuration')
let warnedMissingTopic = false

export function getStartOfTodayUTC(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
}

/**
 * Counts the automatic reviews a creator used: every start that is not a sweep re-send, since the latest human
 * decision. Expects the day's events newest first.
 */
export function countValidationAttempts(
  eventsNewestFirst: CollectionEventAttributes[]
): number {
  let attempts = 0
  for (const event of eventsNewestFirst) {
    if (HUMAN_DECISION_EVENT_TYPES.includes(event.type)) {
      break
    }
    if (
      event.type === CollectionEventType.REVIEW_AI_STARTED &&
      event.payload.trigger !== 'sweep'
    ) {
      attempts++
    }
  }
  return attempts
}

export function redactCollectionEvent(
  event: CollectionEventAttributes
): CollectionEventAttributes {
  return { ...event, payload: utils.omit(event.payload, ['validationId']) }
}

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
   * because the publication just stored their blockchain ids, which their URNs need. The review request itself
   * is opened by the client. Never throws: the publication already happened.
   */
  async onStandardCollectionPublished(
    collection: CollectionAttributes,
    ethAddress: string
  ): Promise<void> {
    try {
      if (isTPCollection(collection) || !(await this.isEnabled())) {
        return
      }
      await withCollectionLock(collection.id, () =>
        this.doOnStandardCollectionPublished(collection, ethAddress)
      )
    } catch (error) {
      logger.error(
        `Error starting the auto curation of collection ${collection.id}: ${
          (error as Error).message
        }`
      )
    }
  }

  /** Publish hook for Third Party collections: their items are curated by hand. Never throws. */
  async onThirdPartyCollectionPublished(
    collection: CollectionAttributes
  ): Promise<void> {
    try {
      if (!(await this.isEnabled())) {
        return
      }
      await CollectionEvent.record({
        collection_id: collection.id,
        type: CollectionEventType.REVIEW_HUMAN_REQUIRED,
        actor: CollectionEventActor.SYSTEM,
        actor_address: null,
        payload: { reason: 'third_party' },
      })
    } catch (error) {
      logger.error(
        `Error recording the human review request of collection ${
          collection.id
        }: ${(error as Error).message}`
      )
    }
  }

  /**
   * Changes hook: the items whose content differs from what is on chain, including the ones the chain holds no
   * content hash for. Items not on chain yet have no URN, so the validator cannot judge them. Never throws: the
   * curation already exists.
   */
  async onChangesSubmitted(
    collectionId: string,
    ethAddress: string
  ): Promise<void> {
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

      const changedItems = await this.findChangedItems(collection)
      await CollectionEvent.record({
        collection_id: collectionId,
        type: CollectionEventType.CHANGES_SUBMITTED,
        actor: CollectionEventActor.CREATOR,
        actor_address: ethAddress.toLowerCase(),
        payload: { itemIds: changedItems.map((item) => item.id) },
      })
      if (changedItems.length === 0) {
        logger.info(
          `No changed items to validate in collection ${collectionId}`
        )
        return
      }

      await withCollectionLock(collectionId, async () => {
        // The request endpoint refuses these before inserting; this only covers a race with the callback.
        if (await this.isValidationInProgress(collectionId)) {
          logger.warn(
            `Not validating the changes of collection ${collectionId}: a validation is in progress`
          )
          return
        }
        if (await this.getDailyLimitRetryAt(collectionId)) {
          logger.warn(
            `Not validating the changes of collection ${collectionId}: the daily limit was reached`
          )
          return
        }
        await this.startValidation(collection, changedItems, 'changes')
      })
    } catch (error) {
      logger.error(
        `Error requesting the validation of the changes of collection ${collectionId}: ${
          (error as Error).message
        }`
      )
    }
  }

  /** Whether a creator may submit changes now: not while a run is in flight, nor past the daily limit. */
  async assertChangesCanBeValidated(collectionId: string): Promise<void> {
    if (!(await this.isEnabled())) {
      return
    }
    if (await this.isValidationInProgress(collectionId)) {
      throw new ValidationInProgressError(collectionId)
    }
    const retryAt = await this.getDailyLimitRetryAt(collectionId)
    if (retryAt) {
      throw new ValidationLimitReachedError(collectionId, retryAt)
    }
  }

  requestValidation(
    collectionId: string,
    ethAddress: string
  ): Promise<CollectionEventAttributes> {
    return withCollectionLock(collectionId, () =>
      this.doRequestValidation(collectionId, ethAddress)
    )
  }

  appeal(
    collectionId: string,
    ethAddress: string,
    note: string
  ): Promise<CollectionCurationAttributes> {
    return withCollectionLock(collectionId, () =>
      this.doAppeal(collectionId, ethAddress, note)
    )
  }

  handleValidationResult(
    collectionId: string,
    result: ValidationResult
  ): Promise<void> {
    return withCollectionLock(collectionId, () =>
      this.doHandleValidationResult(collectionId, result)
    )
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

  /** Re-sends validations that ended in a retryable error, or whose start is older than the stale threshold and got no verdict. */
  async sweepStaleValidations(): Promise<void> {
    if (!(await this.isEnabled())) {
      return
    }

    const staleStarts = await CollectionEvent.findStaleAiStarted(
      new Date(Date.now() - STALE_VALIDATION_MS),
      new Date(Date.now() - SWEEP_LOOKBACK_MS)
    )

    for (const staleStart of staleStarts) {
      try {
        const collection = await Collection.findOne<CollectionAttributes>(
          staleStart.collection_id
        )
        if (!collection || isTPCollection(collection)) {
          continue
        }

        await withCollectionLock(collection.id, async () => {
          // A creator retry may have started a newer validation since the query ran.
          const latestStart = await CollectionEvent.findLatestByCollectionIdAndType(
            collection.id,
            CollectionEventType.REVIEW_AI_STARTED
          )
          if (latestStart?.id !== staleStart.id) {
            return
          }

          const sweepStarts = await CollectionEvent.countSweepStartsSinceManualStart(
            collection.id
          )
          if (sweepStarts >= MAX_SWEEP_RESENDS) {
            await this.giveUpValidation(collection, staleStart)
            return
          }

          const items = await this.findItemsToRevalidate(collection, staleStart)
          await this.startValidation(collection, items, 'sweep')
        })
      } catch (error) {
        logger.error(
          `Error re-sending the validation of collection ${
            staleStart.collection_id
          }: ${(error as Error).message}`
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
        contentHash: await this.getContentHash(item, collection),
        metadata: buildEntityMetadata(cleanItem, collection),
        contents,
      })
    }

    return { validationId, collectionId: collection.id, items: manifestItems }
  }

  private async doOnStandardCollectionPublished(
    collection: CollectionAttributes,
    ethAddress: string
  ): Promise<void> {
    // /publish keeps answering once the collection is on chain; only the first publication opens the review.
    const alreadyPublished = await CollectionEvent.findLatestByCollectionIdAndType(
      collection.id,
      CollectionEventType.COLLECTION_PUBLISHED
    )
    if (alreadyPublished) {
      return
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
  }

  private async doRequestValidation(
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

    const latestStart = await CollectionEvent.findLatestByCollectionIdAndType(
      collectionId,
      CollectionEventType.REVIEW_AI_STARTED
    )
    const itemsToValidate = await this.findItemsToRetry(collection, latestStart)
    if (!itemsToValidate) {
      throw new NothingToRevalidateError(collectionId)
    }

    // A validator rejection is reopened by the retry; a curator's stands until the creator submits changes or
    // appeals. With no request at all (a legacy publish) the collection already reads as under review.
    const latestCuration = await CollectionCuration.findLatestByCollectionId(
      collectionId
    )
    if (latestCuration?.status === CurationStatus.REJECTED) {
      if (latestCuration.reviewed_by !== VALIDATOR_REVIEWER) {
        throw new CurationRejectedByCuratorError(collectionId)
      }
      await this.createPendingCuration(collectionId)
    }

    return this.startValidation(
      collection,
      itemsToValidate,
      'retry',
      ethAddress
    )
  }

  private async doAppeal(
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

    const trimmedNote = note.trim()
    const curation = await this.createPendingCuration(collectionId)
    await CollectionEvent.record({
      collection_id: collectionId,
      type: CollectionEventType.REVIEW_APPEAL_REQUESTED,
      actor: CollectionEventActor.CREATOR,
      actor_address: ethAddress.toLowerCase(),
      payload: { note: trimmedNote },
    })

    const collection = await Collection.findOne<CollectionAttributes>(
      collectionId
    )
    // The note is quoted on one line so a creator cannot forge a message of its own in the channel.
    const quotedNote = trimmedNote
      ? `\n> ${escapeSlackText(trimmedNote).replace(/\s*\n\s*/g, ' ')}`
      : ''
    await notifyCurationSlack(
      `Human review requested for collection ${describeCollection(
        collection,
        collectionId
      )}.${quotedNote}`
    )

    return curation
  }

  /** Applies a validator callback. Results for anything but the latest validation, or already recorded, are ignored. */
  private async doHandleValidationResult(
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
      logger.warn(
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
      logger.warn(
        `Ignoring the validation result ${result.validationId} for collection ${collectionId}: it was already recorded`
      )
      return
    }

    const collection = await Collection.findOne<CollectionAttributes>(
      collectionId
    )
    const staleItemIds = collection
      ? await this.findStaleItemIds(collection, result)
      : []
    const event = {
      collection_id: collectionId,
      actor: CollectionEventActor.VALIDATOR,
      actor_address: null,
      payload: staleItemIds.length ? { ...result, staleItemIds } : result,
    }
    const stale = staleItemIds.length
      ? ` ${staleItemIds.length} item(s) changed while it ran, so it needs a new review.`
      : ''

    switch (result.verdict) {
      case 'passed': {
        const recorded = await CollectionEvent.recordOnce({
          ...event,
          type: CollectionEventType.REVIEW_AI_PASSED,
        })
        if (!recorded) {
          break
        }
        await notifyCurationSlack(
          stale
            ? `AI review passed for collection ${describeCollection(
                collection,
                collectionId
              )}, but${stale}`
            : `AI review passed for collection ${describeCollection(
                collection,
                collectionId
              )}. It is ready for a curator approval.`
        )
        break
      }
      case 'rejected': {
        await CollectionEvent.recordOnce({
          ...event,
          type: CollectionEventType.REVIEW_AI_REJECTED,
        })
        // Idempotent, so a redelivery after a failed update still lands it.
        await this.rejectByValidator(collectionId)
        break
      }
      case 'error': {
        if (result.reason === UNSUPPORTED_VALIDATION_REASON) {
          const unsupportedItems = result.items.filter(
            (item) => item.unsupported
          )
          const handedOff = await CollectionEvent.recordOnce({
            collection_id: collectionId,
            type: CollectionEventType.REVIEW_HUMAN_REQUIRED,
            actor: CollectionEventActor.SYSTEM,
            actor_address: null,
            payload: {
              reason: 'unsupported_items',
              validationId: result.validationId,
              rulesVersion: result.rulesVersion,
              items: unsupportedItems,
            },
          })
          if (!handedOff) {
            break
          }
          await notifyCurationSlack(
            `Collection ${describeCollection(
              collection,
              collectionId
            )} needs a curator review: the validator cannot check ${
              unsupportedItems.length
            } item(s) (${unsupportedItems
              .map((item) => item.itemId)
              .join(', ')}).`
          )
          break
        }
        // Only an explicitly retryable error is left for the sweep; anything else would be re-sent forever.
        if (!result.retryable) {
          const handedOff = await CollectionEvent.recordOnce({
            collection_id: collectionId,
            type: CollectionEventType.REVIEW_HUMAN_REQUIRED,
            actor: CollectionEventActor.SYSTEM,
            actor_address: null,
            payload: {
              reason: 'validator_error',
              validationId: result.validationId,
              rulesVersion: result.rulesVersion,
              items: result.items,
            },
          })
          if (!handedOff) {
            break
          }
          await notifyCurationSlack(
            `Collection ${describeCollection(
              collection,
              collectionId
            )} needs a curator review: the validator could not validate it (validation ${
              result.validationId
            }).`
          )
          break
        }
        const recorded = await CollectionEvent.recordOnce({
          ...event,
          type: CollectionEventType.REVIEW_AI_ERROR,
        })
        if (!recorded) {
          break
        }
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

  /**
   * The validator's rejection lands on the pending request. A collection with no request (published from the
   * legacy Builder, or the client never opened one) gets a rejected one; a request a curator already decided is
   * left alone, the event keeps the verdict.
   */
  private async rejectByValidator(collectionId: string): Promise<void> {
    const latestCuration = await CollectionCuration.findLatestByCollectionId(
      collectionId
    )
    if (!latestCuration) {
      await this.createCuration(collectionId, CurationStatus.REJECTED)
      return
    }
    if (latestCuration.status === CurationStatus.PENDING) {
      await CollectionCuration.update<CollectionCurationAttributes>(
        {
          status: CurationStatus.REJECTED,
          reviewed_by: VALIDATOR_REVIEWER,
          updated_at: new Date(),
        },
        { id: latestCuration.id, status: CurationStatus.PENDING }
      )
    }
  }

  private async startValidation(
    collection: CollectionAttributes,
    items: ItemAttributes[],
    trigger: ValidationTrigger,
    ethAddress: string | null = null
  ): Promise<CollectionEventAttributes> {
    const validationId = uuid()
    const manifest = await this.buildManifest(validationId, collection, items)
    const contentHashes: Record<string, string> = {}
    for (const item of manifest.items) {
      contentHashes[item.itemId] = item.contentHash
    }
    const event = await CollectionEvent.record({
      collection_id: collection.id,
      type: CollectionEventType.REVIEW_AI_STARTED,
      actor: CollectionEventActor.VALIDATOR,
      actor_address: ethAddress ? ethAddress.toLowerCase() : null,
      payload: {
        validationId,
        trigger,
        itemIds: items.map((item) => item.id),
        contentHashes,
      },
    })

    try {
      await publishValidationRequest(manifest)
    } catch (error) {
      if (error instanceof ValidationTooLargeError) {
        await this.handOffTooLarge(collection, validationId, error)
        return event
      }
      // A retryable error lets the next sweep re-send it and a creator retry it right away.
      logger.error(
        `Error sending the validation ${validationId} of collection ${
          collection.id
        }: ${(error as Error).message}`
      )
      await CollectionEvent.recordOnce({
        collection_id: collection.id,
        type: CollectionEventType.REVIEW_AI_ERROR,
        actor: CollectionEventActor.SYSTEM,
        actor_address: null,
        payload: { reason: PUBLISH_FAILED_REASON, validationId },
      })
    }

    return event
  }

  /** Records a request too large to publish as a final error; splitting it is left to a curator. */
  private async handOffTooLarge(
    collection: CollectionAttributes,
    validationId: string,
    { bytes, itemCount }: ValidationTooLargeError
  ): Promise<void> {
    logger.error(
      `The validation ${validationId} of collection ${collection.id} has ${itemCount} items and ${bytes} bytes and was not sent`
    )
    const recorded = await CollectionEvent.recordOnce({
      collection_id: collection.id,
      type: CollectionEventType.REVIEW_AI_ERROR,
      actor: CollectionEventActor.SYSTEM,
      actor_address: null,
      payload: { reason: TOO_LARGE_REASON, validationId, bytes, itemCount },
    })
    if (!recorded) {
      return
    }
    await curationNotifications.validationNotRequested(
      collection.id,
      `it is too large for the automatic review (${itemCount} items, ${bytes} bytes)`
    )
  }

  /** Stops the sweep for a collection: the error event keeps it out of the stale query until someone acts on it. */
  private async giveUpValidation(
    collection: CollectionAttributes,
    staleStart: CollectionEventAttributes
  ): Promise<void> {
    const validationId = staleStart.payload.validationId
    const recorded = await CollectionEvent.recordOnce({
      collection_id: collection.id,
      type: CollectionEventType.REVIEW_AI_ERROR,
      actor: CollectionEventActor.VALIDATOR,
      actor_address: null,
      payload: { reason: SWEEP_EXHAUSTED_REASON, validationId },
    })
    if (!recorded) {
      return
    }
    await notifyCurationSlack(
      `AI review of collection ${describeCollection(
        collection
      )} got no verdict after ${MAX_SWEEP_RESENDS} re-sends (validation ${validationId}). It needs a curator or a creator retry.`
    )
  }

  /**
   * A validation is in progress while its latest start has no verdict, unless a curator decided the collection
   * after it: their decision ends the review, whatever the validator answers later.
   */
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
    if (verdict) {
      return false
    }
    const startedAt = new Date(latestStart.created_at).getTime()
    for (const type of HUMAN_DECISION_EVENT_TYPES) {
      const decision = await CollectionEvent.findLatestByCollectionIdAndType(
        collectionId,
        type as CollectionEventType
      )
      if (decision && new Date(decision.created_at).getTime() > startedAt) {
        return false
      }
    }
    return true
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

  /**
   * The items a creator retry validates, or null when it would repeat the last verdict: the same content always
   * gets the same result, so a retry needs a run without a verdict, or an item whose content changed since.
   */
  private async findItemsToRetry(
    collection: CollectionAttributes,
    latestStart?: CollectionEventAttributes
  ): Promise<ItemAttributes[] | null> {
    if (!latestStart) {
      return Item.findOrderedByCollectionId(collection.id)
    }

    const verdict = await CollectionEvent.findVerdictByValidationId(
      collection.id,
      latestStart.payload.validationId as string
    )
    const previousItems = await this.findItemsToRevalidate(
      collection,
      latestStart
    )
    if (isRetryableVerdict(verdict)) {
      return previousItems
    }

    const previousHashes = (latestStart.payload.contentHashes ?? {}) as Record<
      string,
      string
    >
    const changedItems: ItemAttributes[] = []
    for (const item of await Item.findOrderedByCollectionId(collection.id)) {
      const hash = await this.getContentHash(item, collection)
      if (previousHashes[item.id] !== hash) {
        changedItems.push({ ...item, local_content_hash: hash })
      }
    }
    if (changedItems.length === 0) {
      return null
    }

    const changedIds = new Set(changedItems.map((item) => item.id))
    return [
      ...changedItems,
      ...previousItems.filter((item) => !changedIds.has(item.id)),
    ]
  }

  /** The items whose content differs from the chain, with the hash the manifest will carry. */
  private async findChangedItems(
    collection: CollectionAttributes
  ): Promise<ItemAttributes[]> {
    const [items, remoteItems] = await Promise.all([
      Item.findOrderedByCollectionId(collection.id),
      collectionAPI.fetchItemsByContractAddress(collection.contract_address!),
    ])
    const remoteContentHashes = new Map(
      remoteItems.map((remoteItem) => [
        remoteItem.blockchainId,
        remoteItem.contentHash,
      ])
    )
    const changedItems: ItemAttributes[] = []
    for (const item of items) {
      if (item.blockchain_item_id === null) {
        continue
      }
      const localHash = await this.getContentHash(item, collection)
      if (remoteContentHashes.get(item.blockchain_item_id) !== localHash) {
        changedItems.push({ ...item, local_content_hash: localHash })
      }
    }
    return changedItems
  }

  /** The items whose content changed between the request and the verdict: the validator judged something else. */
  private async findStaleItemIds(
    collection: CollectionAttributes,
    result: ValidationResult
  ): Promise<string[]> {
    if (result.verdict === 'error') {
      return []
    }
    const items = await Item.findByIds(result.items.map((item) => item.itemId))
    const currentHashes = new Map<string, string>()
    for (const item of items) {
      currentHashes.set(item.id, await this.getContentHash(item, collection))
    }
    return result.items
      .filter((item) => {
        const current = currentHashes.get(item.itemId)
        return current !== undefined && current !== item.contentHash
      })
      .map((item) => item.itemId)
  }

  /** The stored hash is only computed when an item is saved after its publication; otherwise it is hashed here. */
  private getContentHash(
    item: ItemAttributes,
    collection: CollectionAttributes
  ): Promise<string> {
    return item.local_content_hash
      ? Promise.resolve(item.local_content_hash)
      : calculateItemContentHash(item, collection)
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
    return this.createCuration(collectionId, CurationStatus.PENDING)
  }

  private createCuration(
    collectionId: string,
    status: CurationStatus
  ): Promise<CollectionCurationAttributes> {
    const now = new Date()
    return CollectionCuration.create<CollectionCurationAttributes>({
      id: uuid(),
      collection_id: collectionId,
      status,
      assignee: null,
      reviewed_by:
        status === CurationStatus.REJECTED ? VALIDATOR_REVIEWER : null,
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
  const creatorsUrl = env.get('CREATORS_URL', '')
  const name = collection ? `"${escapeSlackText(collection.name)}" ` : ''
  return `${name}(${collectionId}) ${creatorsUrl}/collections/${collectionId}`
}

/** A run that ended without judging the content (a failure the sweep gave up on) is worth repeating as is. */
function isRetryableVerdict(verdict?: CollectionEventAttributes): boolean {
  return (
    verdict?.type === CollectionEventType.REVIEW_AI_ERROR &&
    verdict.payload.reason !== TOO_LARGE_REASON
  )
}
