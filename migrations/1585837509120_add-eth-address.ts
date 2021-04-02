import { MigrationBuilder } from 'node-pg-migrate'
import { AssetPack } from '../src/AssetPack'
import { Deployment } from '../src/Deployment'
import { PoolLike } from '../src/PoolLike'
import { Pool } from '../src/Pool'
import { Project } from '../src/Project'

const ethAddressColumnName = 'eth_address'
const userIdColumnName = 'user_id'

function addEthAddress(
  pgm: MigrationBuilder,
  tableName: string,
  hasPrimaryKey = false
) {
  if (hasPrimaryKey) {
    pgm.dropConstraint(tableName, tableName + '_pkey')
  }

  pgm.addColumns(tableName, {
    [ethAddressColumnName]: {
      type: 'TEXT',
    },
  })

  pgm.alterColumn(tableName, userIdColumnName, {})

  pgm.addIndex(tableName, ethAddressColumnName)
}

function removeEthAddress(
  pgm: MigrationBuilder,
  tableName: string,
  hasPrimaryKey = false
) {
  pgm.dropColumn(tableName, ethAddressColumnName)

  if (hasPrimaryKey) {
    pgm.dropConstraint(tableName, tableName + '_pkey')
  }

  pgm.alterColumn(tableName, userIdColumnName, {
    notNull: true,
  })

  if (hasPrimaryKey) {
    pgm.addConstraint(tableName, tableName + '_pkey', {
      primaryKey: userIdColumnName,
    })
  }

  pgm.dropIndex(tableName, ethAddressColumnName)
}

export const up = (pgm: MigrationBuilder) => {
  addEthAddress(pgm, AssetPack.tableName)
  addEthAddress(pgm, Deployment.tableName)
  addEthAddress(pgm, PoolLike.tableName, true)
  addEthAddress(pgm, Pool.tableName)
  addEthAddress(pgm, Project.tableName)
}

/*
  This might blow up if there are rows created with a null `user_id`,
  if that's the case you should run a query to assign those rows to
  some user or delete them before running the downgrade of the db
*/

export const down = (pgm: MigrationBuilder) => {
  removeEthAddress(pgm, AssetPack.tableName)
  removeEthAddress(pgm, Deployment.tableName)
  removeEthAddress(pgm, PoolLike.tableName, true)
  removeEthAddress(pgm, Pool.tableName)
  removeEthAddress(pgm, Project.tableName)
}
