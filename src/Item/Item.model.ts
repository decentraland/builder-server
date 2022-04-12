import { Model, SQL, raw } from 'decentraland-server'
import { Collection } from '../Collection/Collection.model'
import { CurationStatus } from '../Curation'
import { ItemCuration } from '../Curation/ItemCuration'
import { DEFAULT_LIMIT } from '../Pagination/utils'
import { DBItemApprovalData, ItemAttributes } from './Item.types'

type ItemWithTotalCount = ItemAttributes & { total_count: number }

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
      SELECT 
        DISTINCT ON (items.id) items.id,
        item_curations.content_hash
      FROM ${raw(this.tableName)} items
      JOIN ${raw(
        ItemCuration.tableName
      )} item_curations ON items.id = item_curations.item_id
      WHERE 
        items.collection_id = ${collectionId}
      ORDER BY items.id, item_curations.updated_at DESC
    `)
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

  // PAGINATED QUERIES

  static findItemsByAddress(
    address: string,
    thirdPartyIds: string[],
    parmas: {
      collectionId?: string
      limit?: number
      offset?: number
    }
  ) {
    const { collectionId, limit, offset } = parmas
    return this.query<ItemWithTotalCount>(SQL`
      SELECT items.*, count(*) OVER() AS total_count
        FROM ${raw(this.tableName)} items
        LEFT JOIN ${raw(
          Collection.tableName
        )} collections ON collections.id = items.collection_id
        WHERE
          (
            collections.third_party_id = ANY(${thirdPartyIds})
          OR
            (items.eth_address = ${address} AND items.urn_suffix IS NULL)
          )
        ${
          collectionId
            ? SQL`AND items.collection_id ${
                collectionId === 'null' ? SQL`is NULL` : SQL`= ${collectionId}`
              }`
            : SQL``
        }
        LIMIT ${limit}
        OFFSET ${offset}
    `)
  }

  static async findByCollectionIds(
    collectionIds: string[],
    limit: number = DEFAULT_LIMIT,
    offset: number = 0
  ) {
    return await this.query<ItemWithTotalCount>(
      ItemQueries.selectByCollectionIds(collectionIds, undefined, limit, offset)
    )
  }

  static async findByCollectionIdAndStatus(
    collectionId: string,
    status: CurationStatus,
    limit: number = DEFAULT_LIMIT,
    offset: number = 0
  ) {
    return await this.query<ItemWithTotalCount>(
      ItemQueries.selectByCollectionIds([collectionId], status, limit, offset)
    )
  }
}

export const ItemQueries = Object.freeze({
  selectByCollectionIds: (
    collectionIds: string[],
    status?: CurationStatus,
    limit: number = DEFAULT_LIMIT,
    offset: number = 0
  ) =>
    SQL`
      SELECT items.*, count(*) OVER() AS total_count
        FROM ${raw(Item.tableName)} items
        ${
          status
            ? SQL`JOIN ${raw(
                ItemCuration.tableName
              )} item_curations ON items.id = item_curations.item_id`
            : SQL``
        }
        WHERE items.collection_id = ANY(${collectionIds})
          AND ${status ? SQL`item_curations.status = ${status}` : SQL`1 = 1`}
        LIMIT ${limit}
        OFFSET ${offset}
    `,
})
