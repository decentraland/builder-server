import { Model, SQL } from 'decentraland-server'

import { AssetAttributes } from './Asset.types'

export class Asset extends Model<AssetAttributes> {
  static tableName = 'assets'

  static async deleteByIds(ids: string[]) {
    return this.query(
      SQL`DELETE
        FROM ${SQL.raw(this.tableName)}
        WHERE id = ANY(${ids})`
    )
  }
}
