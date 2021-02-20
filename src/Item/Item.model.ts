import { Model, SQL, raw } from 'decentraland-server'

import { ItemAttributes } from './Item.types'

export class Item extends Model<ItemAttributes> {
  static tableName = 'items'

  static findByEthAddress(ethAddress: string) {
    return this.query<ItemAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE eth_address = ${ethAddress}`)
  }

  static findByCollectionId(collectionId: string) {
    return this.query<ItemAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE collection_id = ${collectionId}`)
  }

  static findByBlockchainItemIds(blockchainItemIds: string[]) {
    return this.query<ItemAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE blockchain_item_id = ANY(${blockchainItemIds})`)
  }
}
