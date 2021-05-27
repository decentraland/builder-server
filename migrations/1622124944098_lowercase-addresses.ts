import { MigrationBuilder } from 'node-pg-migrate'
import { AssetPack } from '../src/AssetPack'
import { Collection } from '../src/Collection'
import { Deployment } from '../src/Deployment'
import { Item } from '../src/Item'
import { Pool } from '../src/Pool'
import { PoolLike } from '../src/PoolLike'
import { Project } from '../src/Project'

export const up = (pgm: MigrationBuilder) => {
  const lowercasebleTableNames = [
    AssetPack.tableName,
    Deployment.tableName,
    PoolLike.tableName,
    Pool.tableName,
    Project.tableName,
    Collection.tableName,
    Item.tableName,
  ]

  for (const tableName of lowercasebleTableNames) {
    pgm.sql(`UPDATE ${tableName} set eth_address=LOWER(eth_address)`)
  }
}

// No down migration as we cannot infer how the address looked before being lowercased.
// We're using backups for this
export const down = (_pgm: MigrationBuilder) => {}
