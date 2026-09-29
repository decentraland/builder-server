import { v4 as uuid } from 'uuid'
import { Model, raw, SQL } from 'decentraland-server'
import {
  CollectionEventAttributes,
  CollectionEventType,
  CollectionEventWithTotalCount,
  NewCollectionEvent,
} from './CollectionEvent.types'

let lastTimestamp = 0

// Events written back to back must keep their insertion order when sorted by created_at.
function nextTimestamp(): Date {
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1)
  return new Date(lastTimestamp)
}

export class CollectionEvent extends Model<CollectionEventAttributes> {
  static tableName = 'collection_events'

  static record(event: NewCollectionEvent): Promise<CollectionEventAttributes> {
    return this.create<CollectionEventAttributes>({
      id: uuid(),
      created_at: nextTimestamp(),
      ...event,
    })
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

  static findStaleAiStarted(
    olderThan: Date
  ): Promise<CollectionEventAttributes[]> {
    return this.query<CollectionEventAttributes>(SQL`
      SELECT *
        FROM (
          SELECT DISTINCT ON (collection_id) *
            FROM ${raw(this.tableName)}
            ORDER BY collection_id, created_at DESC
        ) latest
        WHERE latest.type = ${CollectionEventType.REVIEW_AI_STARTED}
          AND latest.created_at < ${olderThan}`)
  }
}
