import { SQL, raw } from 'decentraland-server'
import { AssetPack } from '../AssetPack'
import { Asset } from '../Asset'

export const AssetQueries = Object.freeze({
  selectFromAssetPack: (alias = 'assets') =>
    SQL`ARRAY(
      SELECT row_to_json(a.*)
        FROM ${raw(Asset.tableName)} as a
        WHERE a.asset_pack_id = ${raw(AssetPack.tableName)}.id
      ) as ${raw(alias)}`,
})
