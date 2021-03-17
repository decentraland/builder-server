import { Model, SQL, raw } from 'decentraland-server'
import { Collection } from '../Collection'

import { ItemAttributes } from './Item.types'

export class Item extends Model<ItemAttributes> {
  static tableName = 'items'

  static findByBlockchainIdsAndContractAddresses(
    data: { blockchainId: string; collectionAddress: string }[]
  ) {
    if (data.length === 0) {
      return []
    }

    const where = SQL``
    for (const [index, entry] of data.entries()) {
      const { blockchainId, collectionAddress } = entry
      const or = index > 0 ? SQL` OR ` : SQL``
      where.append(
        SQL`${or} (i.blockchain_item_id = ${blockchainId} AND c.contract_address = ${collectionAddress})`
      )
    }

    return this.query<ItemAttributes>(SQL`
      SELECT i.*
        FROM ${raw(this.tableName)} i
        INNER JOIN ${raw(Collection.tableName)} c ON i.collection_id = c.id
        WHERE ${where}`)
  }
}
