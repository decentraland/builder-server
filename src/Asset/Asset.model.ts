import { Model, SQL, OnConflict, QueryPart } from 'decentraland-server'

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

  static async upsert<U extends QueryPart = any>(
    attributes: U,
    onConflict?: OnConflict<U, Partial<U>> | undefined
  ): Promise<U> {
    const newAttributes = {
      ...attributes,
      // This is to prevent an "invalid input syntax for type json" error caused by node-posgres
      parameters: JSON.stringify(attributes.parameters) as any,
      actions: JSON.stringify(attributes.actions) as any
    }
    return super.upsert(newAttributes, onConflict)
  }
}
