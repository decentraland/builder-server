import { MigrationBuilder } from 'node-pg-migrate'
import { Asset } from '../src/Asset'

const tableName = Asset.tableName
const columns = ['id', 'asset_pack_id']

export const up = (pgm: MigrationBuilder) => {
  pgm.dropConstraint(tableName, 'assets_pkey')

  pgm.addConstraint(tableName, 'assets_pkey', {
    primaryKey: columns,
  })

  pgm.addIndex(tableName, columns, { unique: true })
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropConstraint(tableName, 'assets_pkey')
  pgm.addConstraint(tableName, 'assets_pkey', { primaryKey: 'id' })
  pgm.dropIndex(tableName, columns)
}
