import { Model, SQL } from 'decentraland-server'

import { AssetQueries } from '../Asset'
import { AssetPackAttributes } from './AssetPack.types'

export class AssetPack extends Model<AssetPackAttributes> {
  static tableName = 'asset_packs'

  static async findVisible(userId: string | undefined) {
    const userIdQuery = userId ? SQL`user_id = ${userId}` : SQL`1 = 1`

    return this.query<AssetPackAttributes>(SQL`
      SELECT *, ${AssetQueries.selectFromAssetPack()}
        FROM ${SQL.raw(this.tableName)}
        WHERE is_deleted = FALSE
          AND (${userIdQuery} OR user_id IS NULL)`)
  }

  static async findWithAssets(id: string) {
    return this.query<AssetPackAttributes>(SQL`
      SELECT *, ${AssetQueries.selectFromAssetPack()}
        FROM ${SQL.raw(this.tableName)} as asset_packs
        WHERE is_deleted = FALSE
          AND id = ${id}`)
  }

  static async isVisible(id: string, userId: string) {
    const counts = await this.query(SQL`
      SELECT COUNT(*) as count
        FROM ${SQL.raw(this.tableName)} as asset_packs
        WHERE is_deleted = FALSE
          AND id = ${id}
          AND (user_id = ${userId} OR user_id IS NULL)`)

    return counts[0].count > 0
  }

  static async delete<T = any>(conditions: Partial<T>): Promise<any>
  static async delete(conditions: Partial<AssetPackAttributes>) {
    if (!conditions.user_id) {
      throw new Error('You need to supply an user_id to delete an asset pack')
    }
    return this.update({ is_deleted: true }, conditions)
  }
}
