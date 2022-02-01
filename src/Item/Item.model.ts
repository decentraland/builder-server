import { Model, SQL, raw } from 'decentraland-server'
import { Collection } from '../Collection'

import { ItemAttributes } from './Item.types'

export class Item extends Model<ItemAttributes> {
  static tableName = 'items'

  static findApprovalDataByCollectionId(collectionId: string) {
    return this.query<Pick<ItemAttributes, 'urn_suffix' | 'content_hash'>>(SQL`
      SELECT urn_suffix, content_hash
        FROM ${raw(this.tableName)}
        WHERE collection_id = ${collectionId}
        LIMIT 450000`)
  }

  static findByCollectionIds(collectionIds: string[]) {
    return this.query<ItemAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE collection_id = ANY(${collectionIds})`)
  }

  static findByThirdPartyIds(thirdPartyIds: string[]) {
    return this.query<ItemAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)} i 
        JOIN ${raw(Collection.tableName)} c ON c.id = i.collection_id
        WHERE c.third_party_id = ANY(${thirdPartyIds})`)
  }

  static findOrderedByCollectionId(
    collectionId: string,
    order: 'ASC' | 'DESC' = 'ASC'
  ) {
    return this.query<ItemAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE collection_id = ${collectionId}
        ORDER BY created_at ${raw(order)}`)
  }

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
