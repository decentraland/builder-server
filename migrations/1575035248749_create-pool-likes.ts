import { MigrationBuilder } from 'node-pg-migrate'
import { PoolLike } from '../src/PoolLike'

const tableName = PoolLike.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(
    tableName,
    {
      pool: { type: 'UUID', primaryKey: true },
      user: { type: 'VARCHAR', primaryKey: true },
      created_at: {
        type: 'TIMESTAMP',
        notNull: true,
        default: pgm.func('now()')
      }
    },
    { ifNotExists: true }
  )

  pgm.createIndex(tableName, ['pool', 'created_at'])
  pgm.createIndex(tableName, ['user', 'created_at'])
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(tableName, { cascade: true })
}
