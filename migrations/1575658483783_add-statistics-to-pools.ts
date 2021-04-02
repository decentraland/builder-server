import { MigrationBuilder } from 'node-pg-migrate'
import { Pool } from '../src/Pool'

const tableName = Pool.tableName

export const up = (pgm: MigrationBuilder) => {
  const statisticsType = {
    type: 'INTEGER',
    default: null
  }

  pgm.addColumns(tableName, {
    transforms: statisticsType,
    gltf_shapes: statisticsType,
    nft_shapes: statisticsType,
    scripts: statisticsType,
    parcels: statisticsType,
    entities: statisticsType,
  })
}
