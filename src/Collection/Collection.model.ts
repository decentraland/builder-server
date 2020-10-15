import { SQL, Model } from 'decentraland-server'

import { CollectionQueries } from './Collection.queries'
import { CollectionAttributes, CollectionWithItems } from './Collection.types'

export class Collection extends Model<CollectionAttributes> {
  static tableName = 'collections'

  static async findOneWithItems(id: string) {
    const items = await this.query<CollectionWithItems>(SQL`
      ${CollectionQueries.selectWithItems()}
        WHERE id = ${id}`)
    return items[0]
  }

  static findByEthAddressWithItems(ethAddress: string) {
    return this.query<CollectionWithItems>(SQL`
      ${CollectionQueries.selectWithItems()}
        WHERE eth_address = ${ethAddress}`)
  }
}
