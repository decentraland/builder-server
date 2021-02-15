import { MigrationBuilder } from 'node-pg-migrate'
import { Pool } from '../src/Pool'

const tableName = Pool.tableName

export const up = (pgm: MigrationBuilder) => {
  // Same as 1564049477409_create-projects.ts
  pgm.createTable(
    tableName,
    {
      id: { type: 'UUID', primaryKey: true, unique: true, notNull: true },
      title: { type: 'TEXT', notNull: true },
      description: { type: 'TEXT' },
      thumbnail: { type: 'TEXT' },
      scene_id: { type: 'UUID', notNull: true },
      user_id: { type: 'TEXT', notNull: true },
      cols: { type: 'INT', notNull: true },
      rows: { type: 'INT', notNull: true },
      created_at: { type: 'TIMESTAMP', notNull: true },
      updated_at: { type: 'TIMESTAMP', notNull: true },
    },
    { ifNotExists: true }
  )

  pgm.createIndex(tableName, 'user_id')
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(tableName, {})
}
