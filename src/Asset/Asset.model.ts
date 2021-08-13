import { Model, SQL, OnConflict, QueryPart } from 'decentraland-server'

import { AssetPack } from '../AssetPack'
import { AssetAttributes } from './Asset.types'
import { Parameters } from './Parameters'
import { Actions } from './Actions'

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

  static existsAnyWithADifferentEthAddress(ids: string[], ethAddress: string) {
    return this.query<AssetAttributes>(SQL`
    SELECT COUNT(a.*)
      FROM ${SQL.raw(this.tableName)} a
      INNER JOIN ${SQL.raw(AssetPack.tableName)} ap ON a.asset_pack_id = ap.id
      WHERE a.id = ANY(${ids})
        AND ap.eth_address != ${ethAddress}
        AND ap.is_deleted = FALSE`)
  }

  static findByIds(ids: string[]) {
    return this.query<AssetAttributes>(SQL`
    SELECT *
      FROM ${SQL.raw(this.tableName)}
      WHERE id = ANY(${ids})`)
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
