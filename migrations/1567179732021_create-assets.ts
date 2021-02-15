import { MigrationBuilder } from 'node-pg-migrate'
import { Asset } from '../src/Asset'

const tableName = Asset.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(
    tableName,
    {
      id: { type: 'TEXT', primaryKey: true, unique: true, notNull: true },
      asset_pack_id: { type: 'UUID', notNull: true },
      name: { type: 'TEXT', notNull: true },
      url: { type: 'TEXT' },
      thumbnail: { type: 'TEXT' },
      tags: { type: 'TEXT[]', notNull: true },
      category: { type: 'TEXT', notNull: true },
      contents: { type: 'JSON', notNull: true },
      created_at: { type: 'TIMESTAMP', notNull: true },
      updated_at: { type: 'TIMESTAMP', notNull: true },
    },
    { ifNotExists: true }
  )

  pgm.createIndex(tableName, 'asset_pack_id')
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(tableName, {})
}
