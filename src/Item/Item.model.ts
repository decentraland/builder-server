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

  static async isURNRepeated(
    id: string,
    thirdPartyId: string,
    urnSuffix: string
  ): Promise<boolean> {
    const counts = await this.query<{ count: string }>(SQL`
    SELECT COUNT(*) as count
      FROM ${raw(this.tableName)} items
      JOIN ${raw(
        Collection.tableName
      )} collections ON items.collection_id = collections.id
      WHERE items.id != ${id}
        AND collections.third_party_id = ${thirdPartyId}
        AND items.urn_suffix = ${urnSuffix}`)

    return Number(counts[0].count) > 0
  }

  static async findByURNSuffix(
    thirdPartyId: string,
    urnSuffix: string
  ): Promise<ItemAttributes | undefined> {
    const results = await this.query<ItemAttributes>(SQL`
      SELECT items.*
        FROM ${raw(this.tableName)} items
        JOIN ${raw(
          Collection.tableName
        )} collections ON items.collection_id = collections.id
        WHERE 
          collections.third_party_id = ${thirdPartyId}
        AND 
          items.urn_suffix = ${urnSuffix}
    `)
    return results[0]
  }

  static async hasPublishedItems(contractAddress: string) {
    const results = await this.query<{ count: string }>(SQL`
      SELECT COUNT(*) AS count
        FROM ${raw(this.tableName)} items
        JOIN ${raw(
          Collection.tableName
        )} collections ON items.collection_id = collections.id
        WHERE 
        collections.contract_address = ${contractAddress}
        AND 
          items.blockchain_item_id IS NOT NULL
    `)

    return Number(results[0].count) > 0
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
        ${SQL`LEFT JOIN ${raw(
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
                    ? collectionId !== 'null'
                      ? SQL`AND items.collection_id = ${collectionId}`
                      : SQL`AND items.collection_id is NULL`
                    : SQL``
                }`}
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
        SELECT items.*, count(*) OVER() AS total_count FROM (
          SELECT DISTINCT ON (items.id) items.id, items.*
            FROM ${raw(Item.tableName)} items
              ${
                status
                  ? SQL`JOIN ${raw(
                      ItemCuration.tableName
                    )} item_curations ON items.id = item_curations.item_id`
                  : SQL``
              }
            WHERE items.collection_id = ANY(${collectionIds})
              AND ${
                status ? SQL`item_curations.status = ${status}` : SQL`1 = 1`
              }
            ORDER BY items.id
          ) items
        ORDER BY items.created_at ASC
        LIMIT ${limit}
        OFFSET ${offset}
    `,
})
