import { MigrationBuilder } from 'node-pg-migrate'
import { PoolLike } from '../src/PoolLike'

const tableName = PoolLike.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(
    tableName,
    {
      pool_id: { type: 'UUID', primaryKey: true },
      user_id: { type: 'VARCHAR', primaryKey: true },
      created_at: {
        type: 'TIMESTAMP',
        notNull: true,
        default: pgm.func('now()'),
      },
    },
    { ifNotExists: true }
  )
  pgm.createIndex(tableName, ['user_id', 'created_at'])
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(tableName, { cascade: true })
}
