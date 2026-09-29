import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'

const tableName = 'collection_events'

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
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable(tableName)
}
