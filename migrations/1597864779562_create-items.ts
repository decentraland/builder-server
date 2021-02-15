import { MigrationBuilder } from 'node-pg-migrate'
import { Item } from '../src/Item'

const tableName = Item.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(
    tableName,
    {
      id: { type: 'UUID', primaryKey: true, unique: true, notNull: true },
      name: { type: 'TEXT', notNull: true },
      description: { type: 'TEXT' },
      eth_address: { type: 'TEXT', notNull: true },
      collection_id: { type: 'UUID' },
      blockchain_item_id: { type: 'TEXT' },
      price: { type: 'TEXT' },
      beneficiary: { type: 'TEXT' },
      rarity: { type: 'TEXT' },
      type: { type: 'TEXT', notNull: true },
      data: { type: 'JSON', notNull: true },
      created_at: { type: 'TIMESTAMP', notNull: true },
      updated_at: { type: 'TIMESTAMP', notNull: true },
    },
    { ifNotExists: true }
  )

  pgm.createIndex(tableName, 'eth_address')
  pgm.createIndex(tableName, 'collection_id')
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(tableName, {})
}
