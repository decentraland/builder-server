import { MigrationBuilder } from 'node-pg-migrate'
import { Item } from '../src/Item'
import { ItemCuration } from '../src/Curation/ItemCuration'

const tableName = ItemCuration.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(
    tableName,
    {
      id: { type: 'UUID', primaryKey: true, unique: true, notNull: true },
      item_id: { type: 'UUID', notNull: true },
      status: { type: 'CURATION_STATUS', notNull: true },
      created_at: { type: 'TIMESTAMP', notNull: true },
      updated_at: { type: 'TIMESTAMP', notNull: true },
    },
    {
      ifNotExists: true,
      constraints: {
        foreignKeys: {
          references: Item.tableName,
          columns: 'item_id',
          onDelete: 'CASCADE',
        },
      },
    }
  )

  pgm.createIndex(tableName, 'item_id')
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(tableName, {})
}
