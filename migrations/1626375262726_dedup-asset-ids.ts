import { MigrationBuilder } from 'node-pg-migrate'
import { getAssetPackFiles } from '../scripts/seed/utils'
import { Asset } from '../src/Asset'
import { AssetPack, getDefaultEthAddress } from '../src/AssetPack'

const assetTableName = Asset.tableName
const assetPackTableName = AssetPack.tableName

export const up = async (pgm: MigrationBuilder) => {
  const assetPackFiles = await getAssetPackFiles()

  for (const { data: assetPack } of assetPackFiles) {
    for (const asset of assetPack.assets) {
      pgm.sql(`UPDATE ${assetTableName}
        SET id = '${asset.id}'
        WHERE id = '${asset.legacy_id}' AND asset_pack_id = '${assetPack.id}'`)
    }
  }

  pgm.sql(`UPDATE ${assetTableName}
    SET id = uuid_generate_v4()
    WHERE LENGTH(id) > 36 -- Fixed UUID length
      OR asset_pack_id NOT IN (SELECT id from ${assetPackTableName} ap WHERE LOWER(ap.eth_address) = '${getDefaultEthAddress().toLowerCase()}')`)
}

export const down = async (pgm: MigrationBuilder) => {
  const assetPackFiles = await getAssetPackFiles()
  for (const { data: assetPack } of assetPackFiles) {
    for (const asset of assetPack.assets) {
      pgm.sql(`UPDATE ${assetTableName}
        SET id = '${asset.legacy_id}'
        WHERE id = '${asset.id}'`)
    }
  }
}
