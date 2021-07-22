import { MigrationBuilder } from 'node-pg-migrate'
import { Asset } from '../src/Asset'

const tableName = Asset.tableName
const columns = ['id', 'asset_pack_id']

export const up = async (pgm: MigrationBuilder) => {
  pgm.dropConstraint(tableName, 'assets_pkey')
  pgm.addConstraint(tableName, 'assets_pkey', { primaryKey: 'id' })

  // pgm won't infer this name correctly, so we need to nudge it a little
  pgm.dropIndex(tableName, columns, {
    name: 'assets_id_asset_pack_id_unique_index',
    ifExists: true,
  })
  pgm.addIndex(tableName, 'id', { unique: true })
}

export const down = async (pgm: MigrationBuilder) => {
  pgm.dropConstraint(tableName, 'assets_pkey')
  pgm.addConstraint(tableName, 'assets_pkey', {
    primaryKey: columns,
  })

  pgm.dropIndex(tableName, 'id', {
    name: 'assets_id_unique_index',
    ifExists: true,
  })
  pgm.addIndex(tableName, columns, { unique: true })
}
