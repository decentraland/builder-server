import { Model, SQL, QueryPart } from 'decentraland-server'
import { env } from 'decentraland-commons'

import { AssetQueries } from '../Asset'
import { AssetPackAttributes } from './AssetPack.types'

const DEFAULT_USER_ID = env.get('DEFAULT_USER_ID', '')

export class AssetPack extends Model<AssetPackAttributes> {
  static tableName = 'asset_packs'
  static async count(conditions: Partial<QueryPart>, extra?: string) {
    return super.count({ is_deleted: false, ...conditions }, extra) // don't count deleted asset packs by default
  }

  static async delete(conditions: Partial<QueryPart>) {
    if (!conditions.user_id) {
      throw new Error('You need to supply an user_id to delete an asset pack')
    }
    return this.update({ is_deleted: true }, conditions)
  }

  static async hardDelete(conditions: Partial<AssetPackAttributes>) {
    return this.db.delete(this.tableName, conditions)
  }

  static async count(conditions: Partial<QueryPart>, extra?: string) {
    return super.count({ is_deleted: false, ...conditions }, extra) // don't count deleted asset packs by default
  }

  static async delete(conditions: Partial<QueryPart>) {
    if (!conditions.user_id) {
      throw new Error('You need to supply an user_id to delete an asset pack')
    }
    return this.update({ is_deleted: true }, conditions)
  }

  static async hardDelete(conditions: Partial<AssetPackAttributes>) {
    return this.db.delete(this.tableName, conditions)
  }

  static async findVisible(userId: string | undefined) {
    const userIdQuery = userId ? SQL`user_id = ${userId}` : SQL`1 = 1`

    return this.query<AssetPackAttributes>(SQL`
      SELECT *, ${AssetQueries.selectFromAssetPack()}
        FROM ${SQL.raw(this.tableName)}
        WHERE is_deleted = FALSE
          AND (${userIdQuery} OR user_id = ${DEFAULT_USER_ID})`)
  }

  static async findOneWithAssets(id: string) {
    const assetPacks = await this.query<AssetPackAttributes>(SQL`
      SELECT *, ${AssetQueries.selectFromAssetPack()}
        FROM ${SQL.raw(this.tableName)} as asset_packs
        WHERE is_deleted = FALSE
          AND id = ${id}`)
    return assetPacks[0]
  }

  static async isVisible(id: string, userId: string) {
    const counts = await this.query(SQL`
      SELECT COUNT(*) as count
        FROM ${SQL.raw(this.tableName)} as asset_packs
        WHERE is_deleted = FALSE
          AND id = ${id}
          AND (user_id = ${userId} OR user_id = ${DEFAULT_USER_ID})`)

    return counts[0].count > 0
  }
}
