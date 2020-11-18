import { Model, raw, SQL } from 'decentraland-server'

import { CollectionAttributes } from './Collection.types'

export class Collection extends Model<CollectionAttributes> {
  static tableName = 'collections'

  static findByEthAddress(ethAddress: string) {
    return this.query<CollectionAttributes>(SQL`
    SELECT *
      FROM ${raw(Collection.tableName)}
      WHERE eth_address = ${ethAddress}`)
  }
}
