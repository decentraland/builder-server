import { Model, SQL, raw } from 'decentraland-server'
import { Collection } from '../Collection'
import { CurationStatus } from '../Curation'
import { ItemCuration } from '../Curation/ItemCuration'
import { DBItemApprovalData, ItemAttributes } from './Item.types'

export class Item extends Model<ItemAttributes> {
  static tableName = 'items'

  static findByIds(ids: string[]) {
    return this.query<ItemAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE id = ANY(${ids})`)
  }

  static findDBApprovalDataByCollectionId(collectionId: string) {
    return this.query<DBItemApprovalData>(SQL`
      SELECT items.id, items.urn_suffix, item_curations.local_content_hash
        FROM ${raw(this.tableName)} items
        JOIN ${raw(
          ItemCuration.tableName
        )} item_curations ON items.id = item_curations.item_id AND
        WHERE items.collection_id = ${collectionId}
          AND item_curations.status = ${CurationStatus.PENDING}`)
  }

  static findByCollectionIds(collectionIds: string[]) {
    return this.query<ItemAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE collection_id = ANY(${collectionIds})`)
  }

  static findByThirdPartyIds(thirdPartyIds: string[]) {
    return this.query<ItemAttributes>(SQL`
      SELECT items.*
        FROM ${raw(this.tableName)} items
        JOIN ${raw(
          Collection.tableName
        )} collections ON collections.id = items.collection_id
        WHERE collections.third_party_id = ANY(${thirdPartyIds})`)
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
        SQL`${or} (items.blockchain_item_id = ${blockchainId} AND collections.contract_address = ${collectionAddress})`
      )
    }

    return this.query<ItemAttributes>(SQL`
      SELECT items.*
        FROM ${raw(this.tableName)} items
        INNER JOIN ${raw(
          Collection.tableName
        )} collections ON items.collection_id = collections.id
        WHERE ${where}`)
  }

  static findNonThirdPartyItemsByOwner(owner: string) {
    return this.query<ItemAttributes>(SQL`
      SELECT *
        FROM ${raw(this.tableName)}
        WHERE eth_address = ${owner}
        AND urn_suffix IS NULL`)
  }
}
