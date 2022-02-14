import { MigrationBuilder } from 'node-pg-migrate'
import { SlotUsageCheque } from '../src/SlotUsageCheque'

const tableName = SlotUsageCheque.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(
    tableName,
    {
      id: { type: 'UUID', primaryKey: true, unique: true, notNull: true },
      signedMessage: { type: 'TEXT', notNull: true },
      collection_id: { type: 'TEXT', notNull: true },
      third_party_id: { type: 'TEXT', notNull: true },
      created_at: { type: 'TIMESTAMP', notNull: true },
      updated_at: { type: 'TIMESTAMP', notNull: true },
    },
    { ifNotExists: true }
  )

  pgm.createIndex(tableName, 'collection_id')
  pgm.createIndex(tableName, 'third_party_id')
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(tableName, {})
}
