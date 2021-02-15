import { MigrationBuilder } from 'node-pg-migrate'
import { AssetPack } from '../src/AssetPack'

const tableName = AssetPack.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(
    tableName,
    {
      id: { type: 'UUID', primaryKey: true, unique: true, notNull: true },
      title: { type: 'TEXT', notNull: true },
      url: { type: 'TEXT', notNull: true },
      thumbnail: { type: 'TEXT' },
      user_id: { type: 'TEXT', notNull: true },
      is_deleted: { type: 'BOOLEAN', default: false, notNull: true },
      created_at: { type: 'TIMESTAMP', notNull: true },
      updated_at: { type: 'TIMESTAMP', notNull: true },
    },
    { ifNotExists: true }
  )

  pgm.createIndex(tableName, 'user_id')
  pgm.createIndex(tableName, 'is_deleted')
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(tableName, {})
}
