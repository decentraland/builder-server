import { v4 as uuid } from 'uuid'
import { Model, raw, SQL } from 'decentraland-server'
import {
  CollectionEventAttributes,
  CollectionEventType,
  CollectionEventWithTotalCount,
  NewCollectionEvent,
} from './CollectionEvent.types'

export const SWEEP_EXHAUSTED_REASON = 'sweep_exhausted'

// A human_required carrying a validationId is the validator handing unsupported items to a curator.
const VERDICT_EVENT_TYPES = [
  CollectionEventType.REVIEW_AI_PASSED,
  CollectionEventType.REVIEW_AI_REJECTED,
  CollectionEventType.REVIEW_AI_ERROR,
  CollectionEventType.REVIEW_HUMAN_REQUIRED,
]
// An error verdict is retried by the sweep, so only a pass, a reject or a hand-off ends a validation for it.
const FINAL_VERDICT_EVENT_TYPES = [
  CollectionEventType.REVIEW_AI_PASSED,
  CollectionEventType.REVIEW_AI_REJECTED,
  CollectionEventType.REVIEW_HUMAN_REQUIRED,
]

const HUMAN_DECISION_EVENT_TYPES = [
  CollectionEventType.REVIEW_APPROVED,
  CollectionEventType.REVIEW_REJECTED,
]

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
        ON CONFLICT DO NOTHING
        RETURNING *`)
    return rows[0]
  }

  static async findLatestByCollectionId(
    collectionId: string
  ): Promise<CollectionEventAttributes | undefined> {
    const events = await this.query<CollectionEventAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE collection_id = ${collectionId}
        ORDER BY created_at DESC
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
        ORDER BY created_at DESC
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
        ORDER BY created_at DESC`)
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
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}`)
  }

  /** Counts sweep re-sends since the last validation started by a publish, retry or change. */
  static async countSweepStartsSinceManualStart(
    collectionId: string
  ): Promise<number> {
    const counts = await this.query<{ count: string }>(SQL`
      SELECT COUNT(*) AS count
        FROM ${raw(this.tableName)}
        WHERE collection_id = ${collectionId}
          AND type = ${CollectionEventType.REVIEW_AI_STARTED}
          AND payload->>'trigger' = 'sweep'
          AND created_at > COALESCE((
            SELECT MAX(created_at)
              FROM ${raw(this.tableName)}
              WHERE collection_id = ${collectionId}
                AND type = ${CollectionEventType.REVIEW_AI_STARTED}
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
        ORDER BY created_at DESC
        LIMIT 1`)
    return events[0]
  }

  /** Latest starts within the window with no pass, reject or hand-off verdict, no later curator decision, and not given up by the sweep. */
  static findStaleAiStarted(
    olderThan: Date,
    notBefore: Date
  ): Promise<CollectionEventAttributes[]> {
    return this.query<CollectionEventAttributes>(SQL`
      SELECT started.*
        FROM ${raw(this.tableName)} started
        WHERE started.type = ${CollectionEventType.REVIEW_AI_STARTED}
          AND started.created_at < ${olderThan}
          AND started.created_at > ${notBefore}
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
                AND newer.type = ${CollectionEventType.REVIEW_AI_STARTED}
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
                    verdict.type = ${CollectionEventType.REVIEW_AI_ERROR}
                    AND verdict.payload->>'reason' = ${SWEEP_EXHAUSTED_REASON}
                  )
                )
          )`)
  }
}
