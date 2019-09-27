import { Model, SQL } from 'decentraland-server'

import { AssetAttributes } from './Asset.types'

export class Asset extends Model<AssetAttributes> {
  static tableName = 'assets'

  static async deleteForAssetPackByIds(assetPackId: string, ids: string[]) {
    return this.query(
      SQL`DELETE
        FROM ${SQL.raw(this.tableName)}
        WHERE asset_pack_id = ${assetPackId}
          AND id = ANY(${ids})`
    )
  }
}
