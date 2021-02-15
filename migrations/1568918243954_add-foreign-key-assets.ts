import { MigrationBuilder } from 'node-pg-migrate'
import { Asset } from '../src/Asset'
import { AssetPack } from '../src/AssetPack'

const tableName = Asset.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.addConstraint(tableName, 'asset_pack_id_foreign_key', {
    foreignKeys: {
      columns: ['asset_pack_id'],
      references: AssetPack.tableName,
      onDelete: 'CASCADE',
    },
  })
}
