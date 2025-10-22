import { Model, SQL, raw } from 'decentraland-server'
import { Collection } from '../Collection/Collection.model'
import { CurationStatus } from '../Curation'
import { ItemCuration } from '../Curation/ItemCuration'
import { DEFAULT_LIMIT } from '../Pagination/utils'
import { DBItemApprovalData, ItemAttributes } from './Item.types'

export const MAX_TAGS_LENGTH = 20
// Allow up to 10 outcomes per emote during development, then the hard limit is 3 when trying to publish
export const MAX_OUTCOMES_LENGTH = 10

type ItemWithTotalCount = ItemAttributes & { total_count: number }

export enum ItemMappingStatus {
  MISSING_MAPPING = 'missing_mapping',
  UNPUBLISHED_MAPPING = 'unpublished_mapping',
}

type ItemQueryOptions = {
  status?: CurationStatus
  synced?: boolean
  name?: string
  mappingStatus?: ItemMappingStatus
  limit?: number
  offset?: number
}

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

  static async findByCollectionId(
    collectionId: string,
    options?: ItemQueryOptions
  ) {
    return await this.query<ItemWithTotalCount>(
      ItemQueries.selectByCollectionIds(
        [collectionId],
        {
          status: options?.status,
          synced: options?.synced,
          mappingStatus: options?.mappingStatus,
          name: options?.name,
        },
        options?.limit ?? DEFAULT_LIMIT,
        options?.offset ?? 0
      )
    )
  }
}

export const ItemQueries = Object.freeze({
  selectByCollectionIds: (
    collectionIds: string[],
    options: ItemQueryOptions,
    limit: number = DEFAULT_LIMIT,
    offset: number = 0
  ) => {
    const { status, synced, mappingStatus, name } = options
    return SQL`
        SELECT items.*, count(*) OVER() AS total_count FROM (
          SELECT DISTINCT ON (items.id) items.id, items.*
            FROM ${raw(Item.tableName)} items
              ${
                status || mappingStatus || synced !== undefined
                  ? SQL`
                    LEFT JOIN (
                      SELECT 
                        DISTINCT ON (item_curations.item_id) item_curations.item_id, 
                          item_curations.content_hash,
                          item_curations.status,
                          item_curations.is_mapping_complete
                        FROM ${raw(ItemCuration.tableName)}
                        ORDER BY item_curations.item_id, item_curations.created_at desc
                      ) item_curations
                    ON items.id = item_curations.item_id
                    ${
                      synced === false
                        ? SQL`
                          AND items.local_content_hash != item_curations.content_hash
                          AND item_curations.status = 'approved'`
                        : synced === true
                        ? SQL`
                          AND items.local_content_hash = item_curations.content_hash
                          AND item_curations.status = 'approved'`
                        : SQL``
                    }
                  `
                  : SQL``
              }
            WHERE items.collection_id = ANY(${collectionIds})
              ${
                synced !== undefined
                  ? SQL`AND item_curations.status IS NOT NULL`
                  : SQL``
              }
              ${name ? SQL`AND items.name ILIKE ${`%${name}%`}` : SQL``}
              AND ${
                status ? SQL`item_curations.status = ${status}` : SQL`1 = 1`
              }
              AND ${
                mappingStatus === ItemMappingStatus.MISSING_MAPPING
                  ? SQL`items.mappings IS NULL`
                  : mappingStatus === ItemMappingStatus.UNPUBLISHED_MAPPING
                  ? SQL`(item_curations.is_mapping_complete = false OR item_curations.is_mapping_complete IS NULL) AND items.mappings IS NOT NULL`
                  : SQL`1 = 1`
              }
            ORDER BY items.id
          ) items
        ORDER BY items.created_at ASC
        LIMIT ${limit}
        OFFSET ${offset}
    `
  },
})
