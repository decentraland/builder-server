import { Model, SQL } from 'decentraland-server'

import { ItemQueries } from './Item.queries'
import { ItemAttributes, CollectionItem } from './Item.types'

export class Item extends Model<ItemAttributes> {
  static tableName = 'items'

  static findWithCollection() {
    return this.query<CollectionItem>(ItemQueries.selectWithCollection())
  }

  static findByEthAddressWithCollection(ethAddress: string) {
    return this.query<CollectionItem>(SQL`
      ${ItemQueries.selectWithCollection()}
        WHERE items.eth_address = ${ethAddress}`)
  }
}
