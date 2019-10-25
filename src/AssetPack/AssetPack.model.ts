import { Model, SQL } from 'decentraland-server'

import { AssetQueries } from '../Asset'
import { AssetPackAttributes, FullAssetPackAttributes } from './AssetPack.types'

export class AssetPack extends Model<AssetPackAttributes> {
  static tableName = 'asset_packs'

  static async count(conditions: Partial<AssetPackAttributes>, extra?: string) {
    return super.count({ is_deleted: false, ...conditions }, extra) // don't count deleted asset packs by default
  }

  static async delete(conditions: Partial<AssetPackAttributes>) {
    if (!conditions.user_id) {
      throw new Error('You need to supply an user_id to delete an asset pack')
    }
    return this.update({ is_deleted: true }, conditions)
  }

  static async hardDelete(conditions: Partial<AssetPackAttributes>) {
    return this.db.delete(this.tableName, conditions)
  }

  static async findByUserIdWithAssets(userId: string | undefined) {
    return this.query<FullAssetPackAttributes>(SQL`
      SELECT *, ${AssetQueries.selectFromAssetPack()}
        FROM ${SQL.raw(this.tableName)}
        WHERE is_deleted = FALSE
          AND user_id = ${userId}`)
  }

  static async findOneWithAssets(id: string) {
    const assetPacks = await this.query<FullAssetPackAttributes>(SQL`
      SELECT *, ${AssetQueries.selectFromAssetPack()}
        FROM ${SQL.raw(this.tableName)} as asset_packs
        WHERE is_deleted = FALSE
          AND id = ${id}`)
    return assetPacks[0]
  }

  static async isVisible(id: string, userIds: string[] = []) {
    const counts = await this.query(SQL`
      SELECT COUNT(*) as count
        FROM ${SQL.raw(this.tableName)} as asset_packs
        WHERE is_deleted = FALSE
          AND id = ${id}
          AND user_id = ANY(${userIds})`)

    return counts[0].count > 0
  }
}
