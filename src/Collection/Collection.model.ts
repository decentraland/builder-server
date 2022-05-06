import { Model, raw, SQL } from 'decentraland-server'
import { DEFAULT_LIMIT } from '../Pagination/utils'
import { CurationStatusFilter, CurationStatusSort } from '../Curation'
import { CollectionCuration } from '../Curation/CollectionCuration'
import { database } from '../database/database'
import { Item } from '../Item/Item.model'
import { CollectionAttributes } from './Collection.types'

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
  sort?: CurationStatusSort
  isPublished?: boolean
}

export class Collection extends Model<CollectionAttributes> {
  static tableName = 'collections'

  static getOrderByStatement(sort?: CurationStatusSort) {
    switch (sort) {
      case CurationStatusSort.MOST_RELEVANT:
        return SQL`
          ORDER BY
            CASE WHEN(
              collection_curations.assignee is NULL)
            THEN 0
            WHEN(collection_curations.assignee is NOT NULL AND collection_curations.status = ${CurationStatusFilter.PENDING})
            THEN 1
            WHEN(collection_curations.status = ${CurationStatusFilter.APPROVED})
            THEN 2
              WHEN(collection_curations.status = ${CurationStatusFilter.REJECTED})
            THEN 3
            ELSE 4
          END
        `
      case CurationStatusSort.NAME_ASC:
        return SQL`ORDER BY collections.name ASC`
      case CurationStatusSort.NAME_DESC:
        return SQL`ORDER BY collections.name DESC`
      case CurationStatusSort.NEWEST:
        return SQL`ORDER BY collections.created_at DESC`
      default:
        return SQL``
    }
  }

  static getFindAllWhereStatement({
    q,
    assignee,
    status,
    address,
    thirdPartyIds,
  }: Pick<
    FindCollectionParams,
    'q' | 'assignee' | 'status' | 'address' | 'thirdPartyIds'
  >) {
    if (!q && !assignee && !status && !address && !thirdPartyIds?.length) {
      return SQL``
    }
    const conditions = [
      q ? SQL`collections.name LIKE '%' || ${q} || '%'` : undefined,
      assignee ? SQL`collection_curations.assignee = ${assignee}` : undefined,
      address
        ? thirdPartyIds?.length
          ? SQL`(collections.eth_address = ${address} OR third_party_id = ANY(${thirdPartyIds}))`
          : SQL`collections.eth_address = ${address}`
        : undefined,
      status
        ? [
            CurationStatusFilter.PENDING,
            CurationStatusFilter.APPROVED,
            CurationStatusFilter.REJECTED,
          ].includes(status)
          ? SQL`collection_curations.status = ${status}`
          : status === CurationStatusFilter.TO_REVIEW
          ? SQL`collection_curations.assignee is NULL`
          : status === CurationStatusFilter.UNDER_REVIEW
          ? SQL`collection_curations.assignee is NOT NULL AND collection_curations.status = ${CurationStatusFilter.PENDING}`
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

  static getPublishedJoinStatement(isPublished = false) {
    return isPublished
      ? SQL`JOIN ${raw(
          Item.tableName
        )} items on items.collection_id = collections.id AND items.blockchain_item_id is NOT NULL`
      : SQL``
  }

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
      )} WHERE items.collection_id = collections.id) as item_count
        FROM ${raw(this.tableName)} collections
        ${SQL`LEFT JOIN ${raw(
          CollectionCuration.tableName
        )} collection_curations ON collection_curations.collection_id = collections.id`}
        ${SQL`${this.getPublishedJoinStatement(isPublished)}`}
        ${SQL`${this.getFindAllWhereStatement(whereFilters)}`}
        ${SQL`${this.getOrderByStatement(sort)}`}
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
    SELECT *, (SELECT COUNT(*) FROM ${raw(
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
      DO UPDATE SET ${database.toAssignmentFields(attributes, 1)}
      RETURNING *, (SELECT COUNT(*) FROM ${
        Item.tableName
      } WHERE collections.id = items.collection_id) as item_count`,
      columnValues
    )

    return result[0]
  }
}
