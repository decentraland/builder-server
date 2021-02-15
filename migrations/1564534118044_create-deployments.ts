import { MigrationBuilder } from 'node-pg-migrate'
import { Deployment } from '../src/Deployment'

const tableName = Deployment.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(
    tableName,
    {
      id: { type: 'UUID', primaryKey: true, unique: true, notNull: true },
      user_id: { type: 'TEXT', notNull: true },
      last_published_cid: { type: 'TEXT' },
      is_dirty: { type: 'BOOLEAN', notNull: true },
      x: { type: 'INT', notNull: true },
      y: { type: 'INT', notNull: true },
      rotation: { type: 'TEXT', notNull: true },
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
