import { Model, SQL, raw } from 'decentraland-server'
import { Collection } from '../Collection'

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

  static findByBlockchainIdsAndContractAddresses(
    data: { blockchainId: string; collectionAddress: string }[]
  ) {
    const where = data.reduce(
      (query, { blockchainId, collectionAddress }, index) =>
        query.append(
          SQL`${raw(
            index > 0 ? ' OR ' : ''
          )} (i.blockchain_item_id = ${blockchainId} AND c.contract_address = ${collectionAddress})`
        ),
      SQL``
    )

    return this.query<ItemAttributes>(SQL`
      SELECT i.*
        FROM ${raw(this.tableName)} i
        INNER JOIN ${raw(Collection.tableName)} c ON i.collection_id = c.id
        WHERE ${where}`)
  }
}
