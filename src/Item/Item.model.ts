import { Model, SQL } from 'decentraland-server'

import { Collection } from '../Collection'
import { ItemAttributes, CollectionItemAttributes } from './Item.types'

export class Item extends Model<ItemAttributes> {
  static tableName = 'items'

  static findByEthAddressWithCollection(ethAddress: string) {
    return this.query<CollectionItemAttributes>(SQL`
      SELECT *, row_to_json(collections.*) as collection
        FROM ${SQL.raw(this.tableName)} as items
        JOIN ${SQL.raw(
          Collection.tableName
        )} as collections ON collections.id = items.collection_id
        WHERE items.eth_address = ${ethAddress}`)
  }
}
