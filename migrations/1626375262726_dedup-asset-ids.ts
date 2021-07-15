import { MigrationBuilder } from 'node-pg-migrate'
import { getAssetPackFiles } from '../scripts/seed/utils'
import { Asset } from '../src/Asset'

const tableName = Asset.tableName

export const up = async (pgm: MigrationBuilder) => {
  const assetPackFiles = await getAssetPackFiles()
  const assetPackIds: string[] = []

  for (const { data: assetPack } of assetPackFiles) {
    assetPackIds.push(`'${assetPack.id}'`)

    for (const asset of assetPack.assets) {
      pgm.sql(`UPDATE ${tableName}
        SET id = '${asset.id}'
        WHERE id = '${asset.legacy_id}' AND asset_pack_id = '${assetPack.id}'`)
    }
  }

  pgm.sql(`UPDATE ${tableName}
        SET id = uuid_generate_v4()
        WHERE asset_pack_id NOT IN (${assetPackIds.join(',')})`)
}

export const down = async (pgm: MigrationBuilder) => {
  const assetPackFiles = await getAssetPackFiles()

  for (const { data: assetPack } of assetPackFiles) {
    for (const asset of assetPack.assets) {
      pgm.sql(`UPDATE ${tableName}
        SET id = '${asset.legacy_id}'
        WHERE id = '${asset.id}'`)
    }
  }
}
