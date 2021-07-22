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
        WHERE id = '${asset.legacy_id}' AND asset_pack_id = '${assetPack.id}' AND script is NULL`)
    }
  }

  const defaultAddress = getDefaultEthAddress().toLowerCase()

  // 36 is the fixed uuid length
  pgm.sql(`DELETE
    FROM ${assetTableName} a
    USING ${assetPackTableName} ap
    WHERE a.asset_pack_id = ap.id
      AND script IS NOT NULL
      AND (LENGTH(a.id) != 36 OR is_deleted = TRUE)`)

  pgm.sql(`DELETE
    FROM ${assetTableName} a
    USING ${assetPackTableName} ap
    WHERE a.id IN (
      SELECT id
        FROM ${assetTableName}
        GROUP BY id
      HAVING count(id) > 1
    )
    AND a.asset_pack_id = ap.id
    AND (ap.eth_address != '${defaultAddress}' OR ap.eth_address IS NULL)`)

  pgm.sql(`UPDATE ${assetTableName}
    SET id = uuid_generate_v4()
    WHERE script is NULL
      AND (
        LENGTH(id) != 36
        OR asset_pack_id NOT IN (
          SELECT id from ${assetPackTableName} ap WHERE LOWER(ap.eth_address) = '${defaultAddress}' AND ap.is_deleted != TRUE
        )
      )`)
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
