import { Model, SQL } from 'decentraland-server'

import { AssetQueries } from '../Asset'
import { AssetPackAttributes } from './AssetPack.types'

export class AssetPack extends Model<AssetPackAttributes> {
  static tableName = 'asset_packs'

  static findVisible(userId: string) {
    return this.query<AssetPackAttributes>(SQL`
      SELECT *, ${AssetQueries.selectFromAssetPack()}
        FROM ${SQL.raw(this.tableName)}
        WHERE user_id = ${userId}
          OR user_id IS NULL`)
  }

  static findWithAssets(id: string) {
    return this.query<AssetPackAttributes>(SQL`
      SELECT *, ${AssetQueries.selectFromAssetPack()}
        FROM ${SQL.raw(this.tableName)} as asset_packs
        WHERE id = ${id}`)
  }
}
