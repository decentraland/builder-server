import { MigrationBuilder } from 'node-pg-migrate'
import { PoolGroup } from '../src/PoolGroup'

const tableName = PoolGroup.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(
    tableName,
    {
      id: { type: 'UUID', primaryKey: true },
      name: { type: 'VARCHAR(100)', notNull: true, unique: true },
      active_from: { type: 'TIMESTAMP', notNull: true },
      active_until: { type: 'TIMESTAMP', notNull: true },
      created_at: {
        type: 'TIMESTAMP',
        notNull: true,
        default: pgm.func('now()'),
      },
    },
    { ifNotExists: true }
  )

  pgm.createIndex(tableName, ['active_until'])
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(tableName, {})
}
