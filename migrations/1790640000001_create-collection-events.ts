import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'

const tableName = 'collection_events'
const verdictTypes = [
  'review.ai_passed',
  'review.ai_rejected',
  'review.ai_error',
  'review.human_required',
]

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(tableName, {
    id: { type: 'UUID', primaryKey: true, notNull: true },
    collection_id: {
      type: 'UUID',
      notNull: true,
      references: Collection.tableName,
      onDelete: 'CASCADE',
    },
    type: { type: 'TEXT', notNull: true },
    actor: { type: 'TEXT', notNull: true },
    actor_address: { type: 'TEXT' },
    payload: { type: 'JSONB', notNull: true, default: '{}' },
    created_at: {
      type: 'TIMESTAMP',
      notNull: true,
      default: pgm.func('now()'),
    },
  })

  pgm.createIndex(
    tableName,
    ['collection_id', { name: 'created_at', sort: 'DESC' }],
    { name: 'collection_events_collection_created_idx' }
  )
  pgm.createIndex(tableName, 'created_at', {
    name: 'collection_events_ai_started_idx',
    where: "type = 'review.ai_started'",
  })
  // One verdict per validation. The reason is part of the key so the sweep's give-up can follow a retryable
  // error of the same validation.
  pgm.createIndex(
    tableName,
    [
      'collection_id',
      'type',
      "(payload->>'validationId')",
      "(COALESCE(payload->>'reason', ''))",
    ],
    {
      name: 'collection_events_verdict_validation_idx',
      unique: true,
      where: `type IN (${verdictTypes.map((type) => `'${type}'`).join(',')})`,
    }
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable(tableName)
}
