import { Model, SQL, OnConflict, QueryPart } from 'decentraland-server'

import { AssetPack } from '../AssetPack'
import { AssetAttributes } from './Asset.types'
import { Parameters } from './Parameters'
import { Actions } from './Actions'

export class Asset extends Model<AssetAttributes> {
  static tableName = 'assets'

  static findByIds(ids: string[], ethAddresses?: string[]) {
    const query = SQL`
    SELECT a.* FROM ${SQL.raw(this.tableName)} a`

    if (ethAddresses) {
      query.append(SQL`
      INNER JOIN ${SQL.raw(AssetPack.tableName)} ap ON a.asset_pack_id = ap.id
      WHERE a.id = ANY(${ids})
        AND ap.eth_address = ANY(${ethAddresses})
        AND ap.is_deleted = FALSE`)
    } else {
      query.append(SQL`
      INNER JOIN ${SQL.raw(AssetPack.tableName)} ap ON a.asset_pack_id = ap.id
      WHERE a.id = ANY(${ids})
        AND ap.is_deleted = FALSE`)
    }

    return this.query<AssetAttributes>(query)
  }

  static findByAssetPackId(assetPackId: string, limit: number | null = null) {
    return this.query<AssetAttributes>(SQL`
    SELECT *
      FROM ${SQL.raw(this.tableName)}
      WHERE asset_pack_id = ${assetPackId}
      LIMIT ${limit}`)
  }

  static async upsert<U extends QueryPart = any>(
    attributes: U,
    onConflict?: OnConflict<U, Partial<U>> | undefined
  ): Promise<U> {
    const newAttributes = {
      ...attributes,
      // This is to prevent an "invalid input syntax for type json" error caused by node-posgres
      parameters: JSON.stringify(
        attributes.parameters || new Parameters().getAttributes()
      ),
      actions: JSON.stringify(
        attributes.actions || new Actions().getAttributes()
      ),
    }
    return super.upsert(newAttributes, onConflict)
  }
}
