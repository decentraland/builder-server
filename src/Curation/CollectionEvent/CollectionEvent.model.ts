import { v4 as uuid } from 'uuid'
import { Model, raw, SQL } from 'decentraland-server'
import {
  CollectionEventAttributes,
  CollectionEventType,
  CollectionEventWithTotalCount,
  HUMAN_DECISION_EVENT_TYPES,
  NewCollectionEvent,
} from './CollectionEvent.types'

export const SWEEP_EXHAUSTED_REASON = 'sweep_exhausted'
export const TOO_LARGE_REASON = 'too_large'
export const UNSUPPORTED_ITEMS_REASON = 'unsupported_items'
// The request never reached the topic; the sweep re-sends it.
export const PUBLISH_FAILED_REASON = 'publish_failed'

// A human_required carrying a validationId is the validator handing unsupported items to a curator.
const VERDICT_EVENT_TYPES = [
  CollectionEventType.REVIEW_AUTOMATED_PASSED,
  CollectionEventType.REVIEW_AUTOMATED_REJECTED,
  CollectionEventType.REVIEW_AUTOMATED_ERROR,
  CollectionEventType.REVIEW_HUMAN_REQUIRED,
]
// An error verdict is retried by the sweep, so only a pass, a reject or a hand-off ends a validation for it.
const FINAL_VERDICT_EVENT_TYPES = [
  CollectionEventType.REVIEW_AUTOMATED_PASSED,
  CollectionEventType.REVIEW_AUTOMATED_REJECTED,
  CollectionEventType.REVIEW_HUMAN_REQUIRED,
]

const JUDGED_VERDICT_EVENT_TYPES = [
  CollectionEventType.REVIEW_AUTOMATED_PASSED,
  CollectionEventType.REVIEW_AUTOMATED_REJECTED,
]

/** A start whose items the validator checked: a verdict, or a hand-off of the items it cannot judge (it judged the rest). */
export function judgedStartCondition(alias: string) {
  return SQL`${raw(alias)}.type = ${
    CollectionEventType.REVIEW_AUTOMATED_STARTED
  }
          AND EXISTS (
            SELECT 1
              FROM collection_events verdict
              WHERE verdict.collection_id = ${raw(alias)}.collection_id
                AND verdict.payload->>'validationId' = ${raw(
                  alias
                )}.payload->>'validationId'
                AND (
                  verdict.type = ANY(${JUDGED_VERDICT_EVENT_TYPES})
                  OR (
                    verdict.type = ${CollectionEventType.REVIEW_HUMAN_REQUIRED}
                    AND verdict.payload->>'reason' = ${UNSUPPORTED_ITEMS_REASON}
                  )
                )
          )`
}

let lastTimestamp = 0

// Events written back to back must keep their insertion order when sorted by created_at.
function nextTimestamp(): Date {
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1)
  return new Date(lastTimestamp)
}

export class CollectionEvent extends Model<CollectionEventAttributes> {
  static tableName = 'collection_events'
  // Append-only rows: the table has created_at but no updated_at.
  static withTimestamps = false

  static record(event: NewCollectionEvent): Promise<CollectionEventAttributes> {
    return this.create<CollectionEventAttributes>({
      id: uuid(),
      created_at: nextTimestamp(),
      ...event,
    })
  }

  /** Inserts a verdict once per validationId; returns undefined when it was already recorded (unique index). */
  static async recordOnce(
    event: NewCollectionEvent
  ): Promise<CollectionEventAttributes | undefined> {
    const rows = await this.query<CollectionEventAttributes>(SQL`
      INSERT INTO ${raw(this.tableName)}
        (id, collection_id, type, actor, actor_address, payload, created_at)
        VALUES (
          ${uuid()},
          ${event.collection_id},
          ${event.type},
          ${event.actor},
          ${event.actor_address},
          ${JSON.stringify(event.payload)}::jsonb,
          ${nextTimestamp()}
        )
        ON CONFLICT (collection_id, type, (payload->>'validationId'), (COALESCE(payload->>'reason', '')))
          WHERE type IN ('review.automated_passed', 'review.automated_rejected', 'review.automated_error', 'review.human_required')
          DO NOTHING
        RETURNING *`)
    return rows[0]
  }

  /** Comments are skipped: a conversation never changes where the review stands. */
  static async findLatestByCollectionId(
    collectionId: string
  ): Promise<CollectionEventAttributes | undefined> {
    const events = await this.query<CollectionEventAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE collection_id = ${collectionId}
          AND type <> ${CollectionEventType.REVIEW_COMMENT}
        ORDER BY created_at DESC, id DESC
        LIMIT 1`)
    return events[0]
  }

  static async findLatestByCollectionIdAndTypes(
    collectionId: string,
    types: CollectionEventType[]
  ): Promise<CollectionEventAttributes | undefined> {
    const events = await this.query<CollectionEventAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE collection_id = ${collectionId}
          AND type = ANY(${types})
        ORDER BY created_at DESC, id DESC
        LIMIT 1`)
    return events[0]
  }

  static async findLatestByCollectionIdAndType(
    collectionId: string,
    type: CollectionEventType
  ): Promise<CollectionEventAttributes | undefined> {
    const events = await this.query<CollectionEventAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE collection_id = ${collectionId}
          AND type = ${type}
        ORDER BY created_at DESC, id DESC
        LIMIT 1`)
    return events[0]
  }

  static findByCollectionIdSince(
    collectionId: string,
    since: Date
  ): Promise<CollectionEventAttributes[]> {
    return this.query<CollectionEventAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE collection_id = ${collectionId}
          AND created_at >= ${since}
        ORDER BY created_at DESC, id DESC`)
  }

  static findPageByCollectionId(
    collectionId: string,
    limit: number,
    offset: number
  ): Promise<CollectionEventWithTotalCount[]> {
    return this.query<CollectionEventWithTotalCount>(SQL`
      SELECT *, COUNT(*) OVER() AS total_count
        FROM ${raw(this.tableName)}
        WHERE collection_id = ${collectionId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit}
        OFFSET ${offset}`)
  }

  /**
   * Each item's hash as the most recent run that judged it saw it: a run only carries the items it sent, and a run
   * too large to send or that failed judged none.
   */
  static async findJudgedHashesByCollectionId(
    collectionId: string
  ): Promise<Record<string, string>> {
    const rows = await this.query<{ item_id: string; content_hash: string }>(
      SQL`
      SELECT DISTINCT ON (hashes.key) hashes.key AS item_id, hashes.value AS content_hash
        FROM ${raw(this.tableName)} started
        CROSS JOIN LATERAL jsonb_each_text(COALESCE(started.payload->'contentHashes', '{}'::jsonb)) hashes
        WHERE started.collection_id = ${collectionId}
          AND `.append(judgedStartCondition('started')).append(SQL`
        ORDER BY hashes.key, started.created_at DESC, started.id DESC`)
    )
    const hashes: Record<string, string> = {}
    for (const row of rows) {
      hashes[row.item_id] = row.content_hash
    }
    return hashes
  }

  /** Counts sweep re-sends since the last validation started by a publish, retry or change. */
  static async countSweepStartsSinceManualStart(
    collectionId: string
  ): Promise<number> {
    const counts = await this.query<{ count: string }>(SQL`
      SELECT COUNT(*) AS count
        FROM ${raw(this.tableName)}
        WHERE collection_id = ${collectionId}
          AND type = ${CollectionEventType.REVIEW_AUTOMATED_STARTED}
          AND payload->>'trigger' = 'sweep'
          AND created_at > COALESCE((
            SELECT MAX(created_at)
              FROM ${raw(this.tableName)}
              WHERE collection_id = ${collectionId}
                AND type = ${CollectionEventType.REVIEW_AUTOMATED_STARTED}
                AND payload->>'trigger' <> 'sweep'
          ), '-infinity')`)
    return Number(counts[0]?.count ?? 0)
  }

  static async findVerdictByValidationId(
    collectionId: string,
    validationId: string
  ): Promise<CollectionEventAttributes | undefined> {
    const events = await this.query<CollectionEventAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE collection_id = ${collectionId}
          AND type = ANY(${VERDICT_EVENT_TYPES})
          AND payload->>'validationId' = ${validationId}
        ORDER BY COALESCE(payload->>'reason' = ${PUBLISH_FAILED_REASON}, false),
          created_at DESC,
          id DESC
        LIMIT 1`)
    return events[0]
  }

  /** Latest starts within the window that got a retryable error or are older than the threshold, with no final verdict and no later curator decision. */
  static findStaleAutomatedStarted(
    olderThan: Date,
    notBefore: Date
  ): Promise<CollectionEventAttributes[]> {
    return this.query<CollectionEventAttributes>(SQL`
      SELECT started.*
        FROM ${raw(this.tableName)} started
        WHERE started.type = ${CollectionEventType.REVIEW_AUTOMATED_STARTED}
          AND started.created_at > ${notBefore}
          AND (
            started.created_at < ${olderThan}
            OR EXISTS (
              SELECT 1
                FROM ${raw(this.tableName)} error
                WHERE error.collection_id = started.collection_id
                  AND error.type = ${CollectionEventType.REVIEW_AUTOMATED_ERROR}
                  AND error.payload->>'validationId' = started.payload->>'validationId'
                  AND COALESCE(error.payload->>'retryable' = 'true' OR error.payload->>'reason' = ${PUBLISH_FAILED_REASON}, false)
            )
          )
          AND NOT EXISTS (
            SELECT 1
              FROM ${raw(this.tableName)} decision
              WHERE decision.collection_id = started.collection_id
                AND decision.type = ANY(${HUMAN_DECISION_EVENT_TYPES})
                AND decision.created_at > started.created_at
          )
          AND NOT EXISTS (
            SELECT 1
              FROM ${raw(this.tableName)} newer
              WHERE newer.collection_id = started.collection_id
                AND newer.type = ${CollectionEventType.REVIEW_AUTOMATED_STARTED}
                AND newer.created_at > started.created_at
          )
          AND NOT EXISTS (
            SELECT 1
              FROM ${raw(this.tableName)} verdict
              WHERE verdict.collection_id = started.collection_id
                AND verdict.payload->>'validationId' = started.payload->>'validationId'
                AND (
                  verdict.type = ANY(${FINAL_VERDICT_EVENT_TYPES})
                  OR (
                    verdict.type = ${CollectionEventType.REVIEW_AUTOMATED_ERROR}
                    AND NOT COALESCE(verdict.payload->>'retryable' = 'true' OR verdict.payload->>'reason' = ${PUBLISH_FAILED_REASON}, false)
                  )
                )
          )`)
  }
}
