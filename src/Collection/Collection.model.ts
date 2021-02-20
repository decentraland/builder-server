import { Model, raw, SQL } from 'decentraland-server'

import { CollectionAttributes } from './Collection.types'

export class Collection extends Model<CollectionAttributes> {
  static tableName = 'collections'

  static findByEthAddress(ethAddress: string) {
    return this.query<CollectionAttributes>(SQL`
    SELECT *
      FROM ${raw(this.tableName)}
      WHERE eth_address = ${ethAddress}`)
  }

  static findByEthAddresses(ethAddresses: string[]) {
    return this.query<CollectionAttributes>(SQL`
    SELECT *
      FROM ${raw(this.tableName)}
      WHERE eth_address = ANY(${ethAddresses})`)
  }

  static findByIds(ids: string[]) {
    return this.query<CollectionAttributes>(SQL`
    SELECT *
      FROM ${raw(this.tableName)}
      WHERE id = ANY(${ids})`)
  }

  static async nameExist(name: string) {
    const res = await this.query(SQL`
    SELECT count(*)
      FROM ${raw(this.tableName)}
      WHERE LOWER(name) = ${name.toLowerCase()}`)

    return res.length > 0 && res[0].count > 0
  }
}
