import { Model, SQL } from 'decentraland-server'

import { Asset, AssetQueries, MAX_ASSETS_COUNT } from '../Asset'
import {
  AssetPackAttributes,
  FullAssetPackAttributes,
  MAX_ASSET_PACKS_COUNT,
} from './AssetPack.types'
import {
  getDefaultEthAddress,
  getLimitSplitDate,
  isAfterLimitSplitDate,
} from './utils'

export class AssetPack extends Model<AssetPackAttributes> {
  static tableName = 'asset_packs'

  static async count(conditions: Partial<AssetPackAttributes>, extra?: string) {
    return super.count({ is_deleted: false, ...conditions }, extra) // don't count deleted asset packs by default
  }

  static async delete(conditions: Partial<AssetPackAttributes>) {
    if (!conditions.eth_address) {
      throw new Error(
        'You need to supply an eth_address to delete an asset pack'
      )
    }
    return this.update({ is_deleted: true }, conditions)
  }

  static async hardDelete(conditions: Partial<AssetPackAttributes>) {
    return this.db.delete(this.tableName, conditions)
  }

  static async findByDefaultEthAddress() {
    return this.query<FullAssetPackAttributes>(SQL`
      SELECT *, ${AssetQueries.selectFromAssetPack()}
        FROM ${SQL.raw(this.tableName)}
        WHERE is_deleted = FALSE
          AND eth_address = ${getDefaultEthAddress()}`)
  }

  static async findByEthAddressWithAssets(ethAddress: string | undefined) {
    if (ethAddress === getDefaultEthAddress()) {
      return this.findByDefaultEthAddress()
    }

    const query = SQL`
      SELECT *, ${AssetQueries.selectFromAssetPack()}
        FROM ${SQL.raw(this.tableName)}
        WHERE is_deleted = FALSE
          AND eth_address = ${ethAddress}
          AND created_at < ${getLimitSplitDate()}`

    const queryWithLimit = SQL`
      SELECT *, ${AssetQueries.selectFromAssetPack(
        Asset.tableName,
        MAX_ASSETS_COUNT
      )}
        FROM ${SQL.raw(this.tableName)}
        WHERE is_deleted = FALSE
          AND eth_address = ${ethAddress}
          AND created_at >= ${getLimitSplitDate()}
        LIMIT ${MAX_ASSET_PACKS_COUNT}`

    const results = await Promise.all([
      this.query<FullAssetPackAttributes>(query),
      this.query<FullAssetPackAttributes>(queryWithLimit),
    ])

    return results.flat()
  }

  static async findOneWithAssets(id: string) {
    const [assetPack] = await this.query<FullAssetPackAttributes>(SQL`
      SELECT *
        FROM ${SQL.raw(this.tableName)} as asset_packs
        WHERE is_deleted = FALSE
          AND id = ${id}
        LIMIT 1`)

    if (assetPack) {
      const limit = isAfterLimitSplitDate(new Date(assetPack.created_at))
        ? MAX_ASSETS_COUNT
        : null

      assetPack.assets = await Asset.findByAssetPackId(id, limit)
    }

    return assetPack
  }

  static async isVisible(id: string, ethAddresses: string[] = []) {
    const counts = await this.query(SQL`
      SELECT COUNT(*) as count
        FROM ${SQL.raw(this.tableName)} as asset_packs
        WHERE is_deleted = FALSE
          AND id = ${id}
          AND eth_address = ANY(${ethAddresses})`)

    return counts[0].count > 0
  }
}
