import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'

const tableName = Collection.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(
    tableName,
    {
      id: { type: 'UUID', primaryKey: true, unique: true, notNull: true },
      name: { type: 'TEXT', notNull: true },
      eth_address: { type: 'TEXT', notNull: true },
      salt: { type: 'VARCHAR(32)' },
      contract_address: { type: 'TEXT' },
      is_published: { type: 'BOOLEAN', default: false, notNull: true },
      created_at: { type: 'TIMESTAMP', notNull: true },
      updated_at: { type: 'TIMESTAMP', notNull: true },
    },
    { ifNotExists: true }
  )

  pgm.createIndex(tableName, 'eth_address')
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(tableName, {})
}
