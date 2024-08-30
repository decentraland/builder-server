import { Model, raw, SQL } from 'decentraland-server'
import { DEFAULT_LIMIT } from '../Pagination/utils'
import { CurationStatusFilter } from '../Curation'
import { CollectionCuration } from '../Curation/CollectionCuration'
import { ItemCuration } from '../Curation/ItemCuration'
import { database } from '../database/database'
import { Item } from '../Item/Item.model'
import {
  CollectionAttributes,
  CollectionTypeFilter,
  CollectionSort,
} from './Collection.types'

type CollectionWithItemCount = CollectionAttributes & {
  item_count: number
}

export type CollectionWithCounts = CollectionWithItemCount & {
  collection_count: number
}

export type FindCollectionParams = {
  limit?: number
  offset?: number
  q?: string
  address?: string
  thirdPartyIds?: string[]
  assignee?: string
  status?: CurationStatusFilter
  type?: CollectionTypeFilter
  sort?: CollectionSort
  isPublished?: boolean
  remoteIds?: CollectionAttributes['id'][]
  itemTags?: string[]
}

export class Collection extends Model<CollectionAttributes> {
  static tableName = 'collections'

  static getOrderByStatement(sort?: CollectionSort, remoteIds?: string[]) {
    switch (sort) {
      case CollectionSort.MOST_RELEVANT:
        // Order should be
        // 1- To review: Not assigned && isApproved false from the contract
        // 2- Under review: Assigned && isApproved false from the contract OR has pending curation
        // 3- Approved: Curation approved
        // 4- Rejected: Curation rejected
        return SQL`
          ORDER BY
            CASE WHEN(
              collection_curations.assignee is NULL AND collections.contract_address = ANY(${remoteIds}))
            THEN 0
            WHEN(collection_curations.assignee is NOT NULL AND collection_curations.status = ${CurationStatusFilter.PENDING})
            THEN 1
            WHEN(collection_curations.status = ${CurationStatusFilter.APPROVED})
            THEN 2
              WHEN(collection_curations.status = ${CurationStatusFilter.REJECTED})
            THEN 3
            ELSE 4
          END, collections.created_at DESC
        `
      case CollectionSort.NAME_ASC:
        return SQL`ORDER BY collections.name ASC`
      case CollectionSort.NAME_DESC:
        return SQL`ORDER BY collections.name DESC`
      case CollectionSort.CREATED_AT_DESC:
        return SQL`ORDER BY collections.created_at DESC`
      case CollectionSort.CREATED_AT_ASC:
        return SQL`ORDER BY collections.created_at ASC`
      case CollectionSort.UPDATED_AT_ASC:
        return SQL`ORDER BY collections.updated_at ASC`
      case CollectionSort.UPDATED_AT_DESC:
        return SQL`ORDER BY collections.updated_at DESC`

      default:
        return SQL``
    }
  }

  static getFindAllWhereStatement({
    q,
    assignee,
    status,
    type,
    address,
    thirdPartyIds,
    remoteIds,
  }: Pick<
    FindCollectionParams,
    | 'q'
    | 'assignee'
    | 'status'
    | 'type'
    | 'address'
    | 'thirdPartyIds'
    | 'remoteIds'
  >) {
    if (
      !q &&
      !assignee &&
      !status &&
      !type &&
      !address &&
      !thirdPartyIds?.length
    ) {
      return SQL``
    }
    const search = `%${q}%`
    const isStandard = SQL`collections.third_party_id is NULL AND collections.urn_suffix is NULL`
    const isThirdParty = SQL`collections.third_party_id is NOT NULL AND collections.urn_suffix is NOT NULL`
    const isInRemoteIds = SQL`collections.contract_address = ANY(${remoteIds})`
    const sameStatusAndInTheBlockchain = SQL`(collection_curations.status = ${status} AND (${isInRemoteIds} OR (${isThirdParty})))`
    const conditions = [
      q ? SQL`collections.name ILIKE ${search} ` : undefined,
      assignee ? SQL`collection_curations.assignee = ${assignee}` : undefined,
      address
        ? thirdPartyIds?.length
          ? SQL`(collections.eth_address = ${address} OR third_party_id = ANY(${thirdPartyIds}) OR ${isInRemoteIds})`
          : SQL`(collections.eth_address = ${address} OR ${isInRemoteIds})`
        : undefined,
      status
        ? [
            CurationStatusFilter.PENDING,
            CurationStatusFilter.APPROVED,
          ].includes(status)
          ? SQL`(${sameStatusAndInTheBlockchain} OR (collection_curations.id is NULL AND ${isInRemoteIds}))`
          : status === CurationStatusFilter.REJECTED // To review: Not assigned && isApproved false from the contract
          ? sameStatusAndInTheBlockchain
          : status === CurationStatusFilter.TO_REVIEW // To review: Not assigned && isApproved false from the contract
          ? SQL`collection_curations.assignee is NULL AND ((${isThirdParty}) OR (${isInRemoteIds} AND ${isStandard}))`
          : status === CurationStatusFilter.UNDER_REVIEW // Under review: isApproved false from the contract OR it's assigned & has pending curation
          ? SQL`collection_curations.assignee is NOT NULL AND collection_curations.status = ${CurationStatusFilter.PENDING}`
          : SQL``
        : undefined,
      type
        ? type === CollectionTypeFilter.STANDARD
          ? isStandard
          : type === CollectionTypeFilter.THIRD_PARTY
          ? isThirdParty
          : SQL``
        : undefined,
    ].filter(Boolean)

    if (!conditions.length) {
      return SQL``
    }

    const result = SQL`WHERE `
    conditions.forEach((condition, index) => {
      if (condition) {
        result.append(condition)
        if (conditions[index + 1]) {
          result.append(SQL` AND `)
        }
      }
    })

    return result
  }

  static getPublishedJoinStatement(isPublished: boolean | undefined) {
    return isPublished !== undefined
      ? SQL`
          LEFT JOIN ${raw(Item.tableName)} items ON items.collection_id = c.id
          LEFT JOIN ${raw(
            ItemCuration.tableName
          )} item_curations ON item_curations.item_id = items.id
          ${
            isPublished === false
              ? SQL`
                WHERE (
                  ((items.blockchain_item_id is NULL AND c.third_party_id is NULL) AND
                  (SELECT COUNT(*) FROM item_curations
                    LEFT JOIN items on items.id = item_curations.item_id
                    LEFT JOIN collections cc on cc.id = items.collection_id
                    WHERE items.collection_id = c.id AND item_curations.item_id = items.id
                  ) = 0)
                  OR (c.third_party_id is NOT NULL AND item_curations.item_id is NULL)
                )
              `
              : SQL`
                WHERE (
                  (items.blockchain_item_id is NOT NULL AND c.third_party_id is NULL)
                  OR (c.third_party_id is NOT NULL AND item_curations.item_id is NOT NULL)
                )
              `
          }
        `
      : SQL``
  }

  static getItemsTagJoinStatement(itemTags: string[]) {
    return itemTags.length > 0
      ? SQL`
          JOIN (
            SELECT items.collection_id
            FROM ${raw(Item.tableName)} items
            WHERE LOWER(items.data::json->>'tags')::jsonb ? ANY(${itemTags})
            GROUP BY items.collection_id
          ) items_tags on items_tags.collection_id = collections.id
        `
      : SQL``
  }

  /**
   * Builds the statement to check if the collection requires the mapping migration to be completed.
   * The item migration will be required to be completed if:
   * - The collection has items and any of its items don't have a migration.
   * - The collection has items with mappings but there are items that weren't approved and uploaded.
   */
  static isMappingCompleteTableStatement() {
    return SQL`SELECT NOT EXISTS 
      (SELECT mappings_info.is_mapping_complete FROM
        (SELECT DISTINCT ON (items.id) items.id, item_curations.updated_at, item_curations.is_mapping_complete, items.mappings
          FROM ${raw(Item.tableName)} items
          LEFT JOIN ${raw(
            ItemCuration.tableName
          )} item_curations ON items.id = item_curations.item_id
          WHERE items.collection_id = collections.id
          ORDER BY items.id, item_curations.updated_at DESC) mappings_info
        WHERE mappings_info.is_mapping_complete = false
          OR (mappings_info.is_mapping_complete IS NULL AND mappings_info.updated_at IS NOT NULL AND mappings_info.mappings IS NOT NULL)
          OR mappings_info.mappings IS NULL)
      OR NOT EXISTS (SELECT 1 FROM ${raw(
        Item.tableName
      )} items WHERE items.collection_id = collections.id)`
  }

  /**
   * Finds all the Collections that given parameters. It sorts and paginates the results.
   * If the status is APPROVED, the remoteIds will be the ones with `isApproved` true.
   * If the status is TO_REVIEW, UNDER_REVIEW or REJECTED, the remoteIds will be the ones with `isApproved` false.
   * If status is not defined, the remoteIds will be the ones with `isApproved` false, so the ORDER BY can put them first.
   *
   * @param limit - limit param to paginate the query
   * @param offset - offset param to paginate the query
   * @param sort - the type of sorting to apply. MOST_RELEVANT will return the NOT approved first.
   * @param isPublished - if true, will return only the published collections. If false, will return only the unpublished collections.
   * @param q - the query to search for.
   * @param assignee - the assignee to filter by.
   * @param status - the status to filter by.
   * @param address - the address to filter by.
   * @param thirdPartyIds - the third party ids to filter by. If it's a committee member, the array will have all the ids.
   * @param remoteIds - The remote ids to filter the query with
   * @param itemTags - The item tags to filter the query with
   */
  static findAll({
    limit = DEFAULT_LIMIT,
    offset = 0,
    sort,
    isPublished,
    ...whereFilters
  }: FindCollectionParams) {
    const query = SQL`
      SELECT collections.*, COUNT(*) OVER() as collection_count, (SELECT COUNT(*) FROM ${raw(
        Item.tableName
      )} 
        WHERE items.collection_id = collections.id) as item_count,
        (${SQL`${this.isMappingCompleteTableStatement()}`}) as is_mapping_complete
        FROM (
          SELECT DISTINCT on (c.id) c.* FROM ${raw(Collection.tableName)} c
            ${SQL`${this.getPublishedJoinStatement(isPublished)}`}  
        ) collections
        ${SQL`
        LEFT JOIN
          (SELECT DISTINCT on (cc.collection_id) cc.* FROM ${raw(
            CollectionCuration.tableName
          )} cc ORDER BY cc.collection_id, cc.created_at DESC) collection_curations 
          ON collection_curations.collection_id = collections.id
        `}
        ${
          whereFilters.itemTags
            ? this.getItemsTagJoinStatement(whereFilters.itemTags)
            : SQL``
        }
        ${SQL`${this.getFindAllWhereStatement(whereFilters)}`}
        ${SQL`${this.getOrderByStatement(sort, whereFilters.remoteIds)}`}
        LIMIT ${limit}
        OFFSET ${offset}
      `
    return this.query<CollectionWithCounts>(query)
  }

  static findByAllByAddress(address: string) {
    return this.query<CollectionWithItemCount>(SQL`
      SELECT *, (SELECT COUNT(*) FROM ${raw(
        Item.tableName
      )} WHERE items.collection_id = collections.id) as item_count
        FROM ${raw(this.tableName)}
        WHERE eth_address = ${address}
      `)
  }

  static findByIds(ids: string[]) {
    return this.query<CollectionWithItemCount>(SQL`
    SELECT *, (${SQL`${this.isMappingCompleteTableStatement()}`}) as is_mapping_complete, (SELECT COUNT(*) FROM ${raw(
      Item.tableName
    )} WHERE items.collection_id = collections.id) as item_count
      FROM ${raw(this.tableName)}
      WHERE id = ANY(${ids})`)
  }

  static findByThirdPartyIds(thirdPartyIds: string[]) {
    return this.query<CollectionAttributes>(SQL`
    SELECT *, (SELECT COUNT(*) FROM ${raw(
      Item.tableName
    )} WHERE items.collection_id = collections.id) as item_count
      FROM ${raw(this.tableName)}
      WHERE third_party_id = ANY(${thirdPartyIds})`)
  }

  static findByContractAddresses(contractAddresses: string[]) {
    return this.query<CollectionAttributes>(SQL`
      SELECT *, (SELECT COUNT(*) FROM ${raw(
        Item.tableName
      )} WHERE items.collection_id = collections.id) as item_count
        FROM ${raw(this.tableName)}
        WHERE contract_address = ANY(${contractAddresses})`)
  }

  static async findByItemId(
    itemId: string
  ): Promise<CollectionAttributes | undefined> {
    const collections = await this.query<CollectionAttributes>(SQL`
    SELECT collections.*
      FROM ${raw(this.tableName)} collections
      JOIN ${raw(Item.tableName)} items ON collections.id = items.collection_id
      WHERE items.id = ${itemId}`)

    return collections[0]
  }

  static async isURNRepeated(
    id: string,
    thirdPartyId: string,
    urnSuffix: string
  ): Promise<boolean> {
    const counts = await this.query<{ count: number }>(SQL`
      SELECT COUNT(*) as count
        FROM ${raw(this.tableName)}
        WHERE id != ${id}
          AND third_party_id = ${thirdPartyId}
          AND urn_suffix = ${urnSuffix}`)

    return counts[0].count > 0
  }

  /**
   * Checks if a collection name is valid.
   * A collection name is valid if there's no other collection that has the given
   * name other than the one with the given id.
   *
   * @param id - The collection id.
   * @param name - The collection name to be changed or created.
   */
  static async isValidName(id: string, name: string): Promise<boolean> {
    const counts = await this.query(SQL`
    SELECT count(*) as count
      FROM ${raw(this.tableName)}
      WHERE id != ${id}
        AND third_party_id IS NULL
        AND urn_suffix IS NULL
        AND LOWER(name) = ${name.toLowerCase()}`)

    return counts.length > 0 && counts[0].count <= 0
  }

  static async upsertWithItemCount(
    collection: CollectionAttributes
  ): Promise<CollectionWithItemCount> {
    const { id, ...attributes } = collection
    const columnValues = [id, ...Object.values(attributes)]

    const result = await this.query<CollectionWithItemCount>(
      `INSERT INTO ${this.tableName} as collections (${database.toColumnFields(
        collection
      )})
      VALUES (${database.toValuePlaceholders(collection)})
      ON CONFLICT (id)
      DO UPDATE SET ${database.toAssignmentFields(
        attributes,
        1
      )},"updated_at" = now()
      RETURNING *, (SELECT COUNT(*) FROM ${
        Item.tableName
      } WHERE collections.id = items.collection_id) as item_count`,
      columnValues
    )

    return result[0]
  }
}
