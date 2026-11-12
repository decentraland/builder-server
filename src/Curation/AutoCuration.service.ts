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
import { generatePaginatedResponse, getOffset } from '../Pagination/utils'
import {
  CollectionCuration,
  CollectionCurationAttributes,
} from './CollectionCuration'
import {
  CollectionEvent,
  CollectionEventActor,
  CollectionEventAttributes,
  CollectionEventType,
  HUMAN_DECISION_EVENT_TYPES,
  PUBLISH_FAILED_REASON,
  SWEEP_EXHAUSTED_REASON,
  TOO_LARGE_REASON,
  UNSUPPORTED_ITEMS_REASON,
} from './CollectionEvent'
import { CurationStatus } from './Curation.types'
import { curationNotifications } from './notifications'
import {
  requestValidation as publishValidationRequest,
  ValidationTooLargeError,
} from './validationQueue'
import { escapeSlackText, notifyCurationSlack, toOneLine } from './slack'
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
  NothingToValidateError,
  NotStandardCollectionError,
  TooLargeToValidateError,
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
const MAX_LOGGED_ERROR_LENGTH = 1000
const VERDICT_EVENT_TYPE_BY_VERDICT: Record<
  ValidationResult['verdict'],
  CollectionEventType
> = {
  passed: CollectionEventType.REVIEW_AUTOMATED_PASSED,
  rejected: CollectionEventType.REVIEW_AUTOMATED_REJECTED,
  error: CollectionEventType.REVIEW_AUTOMATED_ERROR,
}

const logger = createConsoleLogComponent().getLogger('AutoCuration')
let warnedMissingTopic = false

/** A run whose start is recorded; its request is sent to the validator once the collection lock is released. */
type StartedValidation = {
  event: CollectionEventAttributes
  collection: CollectionAttributes
  manifest: ValidationManifest
}

/** What a creator's request sends to the validator: the items changed since they were last judged. */
export type SubmittedChanges = {
  collection: CollectionAttributes
  items: ItemAttributes[]
  previousStatus?: CurationStatus
  latestStartId?: string
}

export function getStartOfTodayUTC(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
}

/**
 * Counts the automated reviews a creator used: every start that is not a sweep re-send, since the latest human
 * decision. Expects the day's events newest first.
 */
export function countValidationAttempts(
  eventsNewestFirst: CollectionEventAttributes[]
): number {
  // A start whose request never reached the topic did not run; it is not held against the creator.
  const unsentValidationIds = new Set(
    eventsNewestFirst
      .filter(
        (event) =>
          event.type === CollectionEventType.REVIEW_AUTOMATED_ERROR &&
          event.payload.reason === PUBLISH_FAILED_REASON
      )
      .map((event) => event.payload.validationId)
  )
  let attempts = 0
  for (const event of eventsNewestFirst) {
    if (HUMAN_DECISION_EVENT_TYPES.includes(event.type)) {
      break
    }
    if (
      event.type === CollectionEventType.REVIEW_AUTOMATED_STARTED &&
      event.payload.trigger !== 'sweep' &&
      !unsentValidationIds.has(event.payload.validationId)
    ) {
      attempts++
    }
  }
  return attempts
}

/** What a creator must not read: the id a validator result is matched by, and the validator's raw failures. */
export function redactCollectionEvent(
  event: CollectionEventAttributes
): CollectionEventAttributes {
  const payload = utils.omit<Record<string, unknown>>(event.payload, [
    'validationId',
  ])
  if (Array.isArray(payload.items)) {
    payload.items = payload.items.map((item) =>
      item && typeof item === 'object' ? utils.omit(item, ['error']) : item
    )
  }
  return { ...event, payload }
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
      const started = await withCollectionLock(collection.id, () =>
        this.doOnStandardCollectionPublished(collection, ethAddress)
      )
      this.sendInBackground(started)
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
      // Third Party items are published in batches; the hand-off is recorded once per collection.
      const handedOff = await CollectionEvent.findLatestByCollectionIdAndType(
        collection.id,
        CollectionEventType.REVIEW_HUMAN_REQUIRED
      )
      if (handedOff?.payload.reason === 'third_party') {
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
   * Reads what a creator's request would send to the validator, refusing it while a run is in flight or past the
   * daily limit, before the request is stored. Null when the auto curation is off or the collection has nothing a
   * validator could judge.
   */
  async prepareChanges(
    collectionId: string,
    previousStatus: CurationStatus | undefined
  ): Promise<SubmittedChanges | null> {
    if (!(await this.isEnabled())) {
      return null
    }
    const collection = await Collection.findOne<CollectionAttributes>(
      collectionId
    )
    if (
      !collection ||
      isTPCollection(collection) ||
      !collection.contract_address
    ) {
      return null
    }
    const items = await this.findItemsToSubmit(collection)
    if (items.length > 0) {
      if (await this.isValidationInProgress(collectionId)) {
        throw new ValidationInProgressError(collectionId)
      }
      const retryAt = await this.getDailyLimitRetryAt(collectionId)
      if (retryAt) {
        throw new ValidationLimitReachedError(collectionId, retryAt)
      }
    }
    const latestStart = await CollectionEvent.findLatestByCollectionIdAndType(
      collectionId,
      CollectionEventType.REVIEW_AUTOMATED_STARTED
    )
    return { collection, items, previousStatus, latestStartId: latestStart?.id }
  }

  /**
   * Records the review start of a stored request before the creator gets an answer, so the timeline already shows
   * it. A request after a rejection that changes nothing is an appeal: the validator would repeat its verdict.
   * Never throws: the request is already stored.
   */
  async onChangesSubmitted(
    changes: SubmittedChanges,
    ethAddress: string
  ): Promise<void> {
    const { collection, items, previousStatus } = changes
    try {
      if (items.length === 0) {
        if (previousStatus === CurationStatus.REJECTED) {
          await CollectionEvent.record({
            collection_id: collection.id,
            type: CollectionEventType.REVIEW_APPEAL_REQUESTED,
            actor: CollectionEventActor.CREATOR,
            actor_address: ethAddress.toLowerCase(),
            payload: { note: '' },
          })
        }
        return
      }
      const started = await withCollectionLock(collection.id, async () => {
        // The checks ran before the request was stored: a concurrent request may have started a run since.
        if (await this.wasOvertaken(changes)) {
          logger.warn(
            `Not validating the changes of collection ${collection.id} again: another request started a run or used the daily limit meanwhile`
          )
          return undefined
        }
        await CollectionEvent.record({
          collection_id: collection.id,
          type: CollectionEventType.CHANGES_SUBMITTED,
          actor: CollectionEventActor.CREATOR,
          actor_address: ethAddress.toLowerCase(),
          payload: { itemIds: items.map((item) => item.id) },
        })
        return this.recordStart(collection, items, 'changes')
      })
      this.sendInBackground(started)
    } catch (error) {
      logger.error(
        `Error requesting the validation of the changes of collection ${
          collection.id
        }: ${(error as Error).message}`
      )
    }
  }

  async requestValidation(
    collectionId: string,
    ethAddress: string
  ): Promise<CollectionEventAttributes> {
    const started = await withCollectionLock(collectionId, () =>
      this.doRequestValidation(collectionId, ethAddress)
    )
    await this.sendValidation(started)
    // The caller is a creator: the id is what a validator result is matched by.
    return redactCollectionEvent(started.event)
  }

  async appeal(
    collectionId: string,
    ethAddress: string,
    note: string
  ): Promise<CollectionCurationAttributes> {
    const { curation, notices } = await withCollectionLock(collectionId, () =>
      this.doAppeal(collectionId, ethAddress, note)
    )
    await sendNotices(notices)
    return curation
  }

  async handleValidationResult(
    collectionId: string,
    result: ValidationResult
  ): Promise<void> {
    const notices = await withCollectionLock(collectionId, () =>
      this.doHandleValidationResult(collectionId, result)
    )
    await sendNotices(notices)
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
      getOffset(page, limit)
    )
    const total = Number(rows[0]?.total_count ?? 0)
    const results = rows.map((row) => {
      const event = utils.omit<CollectionEventAttributes>(row, ['total_count'])
      return canSeeValidationIds ? event : redactCollectionEvent(event)
    })

    return generatePaginatedResponse(results, total, limit, page)
  }

  /** Re-sends validations that ended in a retryable error, or whose start is older than the stale threshold and got no verdict. */
  async sweepStaleValidations(): Promise<void> {
    if (!(await this.isEnabled())) {
      return
    }

    const staleStarts = await CollectionEvent.findStaleAutomatedStarted(
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

        let giveUpNotice: string | undefined
        const started = await withCollectionLock(collection.id, async () => {
          // A creator retry may have started a newer validation since the query ran.
          const latestStart = await CollectionEvent.findLatestByCollectionIdAndType(
            collection.id,
            CollectionEventType.REVIEW_AUTOMATED_STARTED
          )
          if (latestStart?.id !== staleStart.id) {
            return undefined
          }

          const sweepStarts = await CollectionEvent.countSweepStartsSinceManualStart(
            collection.id
          )
          if (sweepStarts >= MAX_SWEEP_RESENDS) {
            giveUpNotice = await this.giveUpValidation(collection, staleStart)
            return undefined
          }

          const items = await this.findItemsToRevalidate(collection, staleStart)
          return this.recordStart(collection, items, 'sweep')
        })
        await this.sendValidation(started)
        if (giveUpNotice) {
          await notifyCurationSlack(giveUpNotice)
        }
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
  ): Promise<StartedValidation | undefined> {
    // /publish keeps answering once the collection is on chain; a start means the review already began. A
    // publication recorded without one (the start failed) is resumed.
    const anyStart = await CollectionEvent.findLatestByCollectionIdAndType(
      collection.id,
      CollectionEventType.REVIEW_AUTOMATED_STARTED
    )
    if (anyStart) {
      return undefined
    }
    const published = await CollectionEvent.findLatestByCollectionIdAndType(
      collection.id,
      CollectionEventType.COLLECTION_PUBLISHED
    )
    if (!published) {
      await CollectionEvent.record({
        collection_id: collection.id,
        type: CollectionEventType.COLLECTION_PUBLISHED,
        actor: CollectionEventActor.CREATOR,
        actor_address: ethAddress.toLowerCase(),
        payload: {},
      })
    }

    const items = await Item.findOrderedByCollectionId(collection.id)
    return this.recordStart(collection, items, 'publish')
  }

  private async doRequestValidation(
    collectionId: string,
    ethAddress: string
  ): Promise<StartedValidation> {
    const collection = await this.getStandardCollection(collectionId)
    const latestCuration = await CollectionCuration.findLatestByCollectionId(
      collectionId
    )
    // Approved content changes go through a review request, which validates them.
    if (latestCuration?.status === CurationStatus.APPROVED) {
      throw new NothingToValidateError(collectionId)
    }

    // A validator rejection is reopened by the retry; a curator's stands until the creator submits changes or
    // appeals, whatever the last run's outcome. With no request at all (a legacy publish) the collection already
    // reads as under review.
    if (
      latestCuration?.status === CurationStatus.REJECTED &&
      latestCuration.reviewed_by !== VALIDATOR_REVIEWER
    ) {
      throw new CurationRejectedByCuratorError(collectionId)
    }

    if (await this.isValidationInProgress(collectionId)) {
      throw new ValidationInProgressError(collectionId)
    }

    const retryAt = await this.getDailyLimitRetryAt(collectionId)
    if (retryAt) {
      throw new ValidationLimitReachedError(collectionId, retryAt)
    }

    const latestStart = await CollectionEvent.findLatestByCollectionIdAndType(
      collectionId,
      CollectionEventType.REVIEW_AUTOMATED_STARTED
    )
    const itemsToValidate = await this.findItemsToRetry(collection, latestStart)
    if (!itemsToValidate) {
      throw new NothingToRevalidateError(collectionId)
    }

    // The start goes first: a reopened request with no run behind it would never be recovered by the sweep.
    const started = await this.recordStart(
      collection,
      itemsToValidate,
      'retry',
      ethAddress
    )
    if (latestCuration?.status === CurationStatus.REJECTED) {
      await this.createPendingCuration(collectionId)
    }
    return started
  }

  private async doAppeal(
    collectionId: string,
    ethAddress: string,
    note: string
  ): Promise<{ curation: CollectionCurationAttributes; notices: string[] }> {
    const latestEvent = await CollectionEvent.findLatestByCollectionId(
      collectionId
    )
    const latestCuration = await CollectionCuration.findLatestByCollectionId(
      collectionId
    )
    const appealRecorded =
      latestEvent?.type === CollectionEventType.REVIEW_APPEAL_REQUESTED
    if (appealRecorded && latestCuration?.status === CurationStatus.PENDING) {
      throw new AppealAlreadyOpenError(collectionId)
    }
    if (!latestCuration || latestCuration.status !== CurationStatus.REJECTED) {
      throw new CurationNotRejectedError(collectionId)
    }

    // The appeal is recorded before the request, so a retry after a failed insert only opens the request.
    const trimmedNote = note.trim()
    if (!appealRecorded) {
      await CollectionEvent.record({
        collection_id: collectionId,
        type: CollectionEventType.REVIEW_APPEAL_REQUESTED,
        actor: CollectionEventActor.CREATOR,
        actor_address: ethAddress.toLowerCase(),
        payload: { note: trimmedNote },
      })
    }
    const curation = await this.createPendingCuration(collectionId)

    const collection = await Collection.findOne<CollectionAttributes>(
      collectionId
    )
    // The note is quoted on one line so a creator cannot forge a message of its own in the channel.
    const quotedNote = trimmedNote
      ? `\n> ${escapeSlackText(toOneLine(trimmedNote))}`
      : ''
    const notice = `Human review requested for collection ${describeCollection(
      collection,
      collectionId
    )}.${quotedNote}`

    return { curation, notices: [notice] }
  }

  /** Applies a validator callback. Results for anything but the latest validation, or already recorded, are ignored. */
  private async doHandleValidationResult(
    collectionId: string,
    result: ValidationResult
  ): Promise<string[]> {
    const notices: string[] = []
    const latestStart = await CollectionEvent.findLatestByCollectionIdAndType(
      collectionId,
      CollectionEventType.REVIEW_AUTOMATED_STARTED
    )
    if (
      !latestStart ||
      latestStart.payload.validationId !== result.validationId
    ) {
      logger.warn(
        `Ignoring the validation result ${result.validationId} for collection ${collectionId}: it is not the latest validation`
      )
      return notices
    }
    // A request the server could not confirm sending may still have reached the validator.
    const recorded = await CollectionEvent.findVerdictByValidationId(
      collectionId,
      result.validationId
    )
    if (recorded && recorded.payload.reason !== PUBLISH_FAILED_REASON) {
      logger.warn(
        `Ignoring the validation result ${result.validationId} for collection ${collectionId}: it was already recorded`
      )
      return notices
    }

    // Creators never read these, so the log is where a developer finds them.
    for (const item of result.items) {
      if (item.error) {
        logger.warn(
          `Validation ${
            result.validationId
          } of collection ${collectionId} could not validate item ${
            item.itemId
          }: ${toOneLine(item.error).slice(0, MAX_LOGGED_ERROR_LENGTH)}`
        )
      }
    }

    // With the flag off the verdict only feeds the timeline: nothing is decided in the validator's name.
    if (!(await this.isEnabled())) {
      await CollectionEvent.recordOnce({
        collection_id: collectionId,
        actor: CollectionEventActor.VALIDATOR,
        actor_address: null,
        payload: result,
        type: VERDICT_EVENT_TYPE_BY_VERDICT[result.verdict],
      })
      return notices
    }

    const collection = await Collection.findOne<CollectionAttributes>(
      collectionId
    )
    // A curator decided while it ran: their decision stands, the verdict is only kept for the timeline.
    const decidedByCurator = await this.hasHumanDecisionSince(
      collectionId,
      new Date(latestStart.created_at)
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
        // A pass supersedes the validator's own rejection, also when the retry could not reopen the request.
        if (!decidedByCurator) {
          await this.reopenValidatorRejection(collectionId)
        }
        const recorded = await CollectionEvent.recordOnce({
          ...event,
          type: CollectionEventType.REVIEW_AUTOMATED_PASSED,
        })
        if (!recorded) {
          break
        }
        if (decidedByCurator) {
          break
        }
        notices.push(
          stale
            ? `Automated review passed for collection ${describeCollection(
                collection,
                collectionId
              )}, but${stale}`
            : `Automated review passed for collection ${describeCollection(
                collection,
                collectionId
              )}. It is ready for a curator approval.`
        )
        break
      }
      case 'rejected': {
        // The curation goes first and the event last: the event is what marks a redelivery as done.
        if (!decidedByCurator) {
          await this.rejectByValidator(collectionId)
        }
        await CollectionEvent.recordOnce({
          ...event,
          type: CollectionEventType.REVIEW_AUTOMATED_REJECTED,
        })
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
              reason: UNSUPPORTED_ITEMS_REASON,
              validationId: result.validationId,
              rulesVersion: result.rulesVersion,
              items: unsupportedItems,
            },
          })
          if (!handedOff) {
            break
          }
          notices.push(
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
          notices.push(
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
          type: CollectionEventType.REVIEW_AUTOMATED_ERROR,
        })
        if (!recorded) {
          break
        }
        notices.push(
          `Automated review failed for collection ${describeCollection(
            collection,
            collectionId
          )} (validation ${
            result.validationId
          }). It will be re-sent automatically.`
        )
        break
      }
    }
    return notices
  }

  /** A sweep re-send does not count: the changes supersede it, and its verdict is no longer the latest. */
  private async wasOvertaken(changes: SubmittedChanges): Promise<boolean> {
    const collectionId = changes.collection.id
    const latestStart = await CollectionEvent.findLatestByCollectionIdAndType(
      collectionId,
      CollectionEventType.REVIEW_AUTOMATED_STARTED
    )
    if (
      latestStart &&
      latestStart.id !== changes.latestStartId &&
      latestStart.payload.trigger !== 'sweep'
    ) {
      return true
    }
    return (await this.getDailyLimitRetryAt(collectionId)) !== null
  }

  private async reopenValidatorRejection(collectionId: string): Promise<void> {
    const latestCuration = await CollectionCuration.findLatestByCollectionId(
      collectionId
    )
    if (
      latestCuration?.status === CurationStatus.REJECTED &&
      latestCuration.reviewed_by === VALIDATOR_REVIEWER
    ) {
      await this.createPendingCuration(collectionId)
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

  private async recordStart(
    collection: CollectionAttributes,
    items: ItemAttributes[],
    trigger: ValidationTrigger,
    ethAddress: string | null = null
  ): Promise<StartedValidation> {
    const validationId = uuid()
    const manifest = await this.buildManifest(validationId, collection, items)
    const contentHashes: Record<string, string> = {}
    for (const item of manifest.items) {
      contentHashes[item.itemId] = item.contentHash
    }
    const event = await CollectionEvent.record({
      collection_id: collection.id,
      type: CollectionEventType.REVIEW_AUTOMATED_STARTED,
      actor: CollectionEventActor.VALIDATOR,
      actor_address: ethAddress ? ethAddress.toLowerCase() : null,
      payload: {
        validationId,
        trigger,
        itemIds: items.map((item) => item.id),
        contentHashes,
      },
    })
    return { event, collection, manifest }
  }

  /** The start is recorded before the answer; the creator does not wait for the validator's queue. */
  private sendInBackground(started?: StartedValidation): void {
    this.sendValidation(started).catch((error) =>
      logger.error(`Error sending a validation: ${(error as Error).message}`)
    )
  }

  /** Runs outside the collection lock: the start is recorded, so a failure here is left to the sweep. */
  private async sendValidation(started?: StartedValidation): Promise<void> {
    if (!started) {
      return
    }
    const { collection, manifest } = started
    try {
      await publishValidationRequest(manifest)
    } catch (error) {
      if (error instanceof ValidationTooLargeError) {
        await this.handOffTooLarge(collection, manifest.validationId, error)
        return
      }
      // A retryable error lets the next sweep re-send it and a creator retry it right away.
      logger.error(
        `Error sending the validation ${manifest.validationId} of collection ${
          collection.id
        }: ${(error as Error).message}`
      )
      await CollectionEvent.recordOnce({
        collection_id: collection.id,
        type: CollectionEventType.REVIEW_AUTOMATED_ERROR,
        actor: CollectionEventActor.SYSTEM,
        actor_address: null,
        payload: {
          reason: PUBLISH_FAILED_REASON,
          validationId: manifest.validationId,
        },
      })
    }
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
      type: CollectionEventType.REVIEW_AUTOMATED_ERROR,
      actor: CollectionEventActor.SYSTEM,
      actor_address: null,
      payload: { reason: TOO_LARGE_REASON, validationId, bytes, itemCount },
    })
    if (!recorded) {
      return
    }
    await curationNotifications.validationNotRequested(
      collection.id,
      `it is too large for the automated review (${itemCount} items, ${bytes} bytes)`
    )
  }

  /** Stops the sweep for a collection: the error event keeps it out of the stale query until someone acts on it. */
  private async giveUpValidation(
    collection: CollectionAttributes,
    staleStart: CollectionEventAttributes
  ): Promise<string | undefined> {
    const validationId = staleStart.payload.validationId
    const recorded = await CollectionEvent.recordOnce({
      collection_id: collection.id,
      type: CollectionEventType.REVIEW_AUTOMATED_ERROR,
      actor: CollectionEventActor.VALIDATOR,
      actor_address: null,
      payload: { reason: SWEEP_EXHAUSTED_REASON, validationId },
    })
    if (!recorded) {
      return undefined
    }
    return `Automated review of collection ${describeCollection(
      collection
    )} got no verdict after ${MAX_SWEEP_RESENDS} re-sends (validation ${validationId}). It needs a curator or a creator retry.`
  }

  /**
   * A validation is in progress while its latest start has no verdict, unless a curator decided the collection
   * after it: their decision ends the review, whatever the validator answers later.
   */
  private async isValidationInProgress(collectionId: string): Promise<boolean> {
    const latestStart = await CollectionEvent.findLatestByCollectionIdAndType(
      collectionId,
      CollectionEventType.REVIEW_AUTOMATED_STARTED
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
    return !(await this.hasHumanDecisionSince(
      collectionId,
      new Date(latestStart.created_at)
    ))
  }

  private async hasHumanDecisionSince(
    collectionId: string,
    since: Date
  ): Promise<boolean> {
    for (const type of HUMAN_DECISION_EVENT_TYPES) {
      const decision = await CollectionEvent.findLatestByCollectionIdAndType(
        collectionId,
        type
      )
      if (
        decision &&
        new Date(decision.created_at).getTime() > since.getTime()
      ) {
        return true
      }
    }
    return false
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
    // The run was handed to a curator; retrying the same request would be refused for its size again.
    if (
      verdict?.type === CollectionEventType.REVIEW_AUTOMATED_ERROR &&
      verdict.payload.reason === TOO_LARGE_REASON
    ) {
      throw new TooLargeToValidateError(collection.id)
    }

    const previousHashes = await this.findJudgedHashes(collection.id)
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

  /** The items changed on chain's view and since the last run judged them: unchanged ones would get the same verdict. */
  private async findItemsToSubmit(
    collection: CollectionAttributes
  ): Promise<ItemAttributes[]> {
    let changedItems: ItemAttributes[]
    try {
      changedItems = await this.findChangedItems(collection)
    } catch (error) {
      // Without the chain's hashes the past runs are the only baseline; the request must not fail on the graph.
      logger.warn(
        `Could not read the on-chain items of collection ${
          collection.id
        }, comparing with the past runs only: ${(error as Error).message}`
      )
      const items = await Item.findOrderedByCollectionId(collection.id)
      changedItems = []
      for (const item of items) {
        if (item.blockchain_item_id !== null) {
          changedItems.push({
            ...item,
            local_content_hash: await this.getContentHash(item, collection),
          })
        }
      }
    }
    const judgedHashes = await this.findJudgedHashes(collection.id)
    return changedItems.filter(
      (item) => judgedHashes[item.id] !== item.local_content_hash
    )
  }

  /** Each item's hash as the most recent run that judged it saw it: a run only carries the items it sent. */
  private async findJudgedHashes(
    collectionId: string
  ): Promise<Record<string, string>> {
    const judged: Record<string, string> = {}
    for (const start of await CollectionEvent.findJudgedStartsByCollectionId(
      collectionId
    )) {
      const hashes = (start.payload.contentHashes ?? {}) as Record<
        string,
        string
      >
      for (const [itemId, hash] of Object.entries(hashes)) {
        if (!(itemId in judged)) {
          judged[itemId] = hash
        }
      }
    }
    return judged
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

async function sendNotices(notices: string[]): Promise<void> {
  for (const notice of notices) {
    await notifyCurationSlack(notice)
  }
}

function describeCollection(
  collection: CollectionAttributes | undefined,
  collectionId = collection?.id ?? ''
): string {
  const creatorsUrl = env.get('CREATORS_URL', '')
  // Names may hold newlines, which would let a creator forge lines of their own in the channel.
  const name = collection
    ? `"${escapeSlackText(toOneLine(collection.name))}" `
    : ''
  return `${name}(${collectionId}) ${creatorsUrl}/collections/${collectionId}`
}

/** A run that ended without judging the content (a failure the sweep gave up on) is worth repeating as is. */
function isRetryableVerdict(verdict?: CollectionEventAttributes): boolean {
  return (
    verdict?.type === CollectionEventType.REVIEW_AUTOMATED_ERROR &&
    verdict.payload.reason !== TOO_LARGE_REASON
  )
}
