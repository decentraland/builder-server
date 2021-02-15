import { MigrationBuilder } from 'node-pg-migrate'
import { Project } from '../src/Project'
import { Deployment } from '../src/Deployment'
import { Pool } from '../src/Pool'
import { AssetPack } from '../src/AssetPack'
import { PoolLike } from '../src/PoolLike'

const tableNames = [
  Project.tableName,
  Deployment.tableName,
  Pool.tableName,
  AssetPack.tableName,
  PoolLike.tableName,
]

export const up = (pgm: MigrationBuilder) => {
  for (const tableName of tableNames) {
    pgm.dropColumn(tableName, 'user_id')
  }
}

export const down = (pgm: MigrationBuilder) => {
  const userIdColumn = { user_id: { type: 'TEXT' } }

  for (const tableName of tableNames) {
    pgm.addColumn(tableName, userIdColumn)
    pgm.addIndex(tableName, 'user_id')
  }
}
