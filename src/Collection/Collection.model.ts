import { Model, raw, SQL } from 'decentraland-server'
import { DEFAULT_LIMIT } from '../Pagination/utils'
import { CurationStatusFilter, UNASSIGNED_FILTER } from '../Curation'
import { CollectionCuration } from '../Curation/CollectionCuration'
import { ItemCuration } from '../Curation/ItemCuration'
import { database } from '../database/database'
import { Item } from '../Item/Item.model'
import {
  CollectionAttributes,
  CollectionTypeFilter,
  CollectionSort,
  CollectionStatus,
  CollectionStatusCounts,
  ReviewTypeFilter,
  UpsertableCollectionAttributes,
} from './Collection.types'

type CollectionWithItemCount = CollectionAttributes & {
  item_count: number
}

export type CollectionWithCounts = CollectionWithItemCount & {
  collection_count: number
  is_programmatic?: boolean
}

export type FindCollectionParams = {
  limit?: number
  offset?: number
  q?: string
  contractAddress?: string
  address?: string
  thirdPartyIds?: string[]
  /** Curator addresses, plus `UNASSIGNED_FILTER` for the collections without one; any of them matches. */
  assignees?: string[]
  /** Any of them matches. */
  statuses?: CurationStatusFilter[]
  reviewType?: ReviewTypeFilter
  type?: CollectionTypeFilter
  sort?: CollectionSort
  isPublished?: boolean
  /** Every collection on chain the query may see. */
  remoteIds?: CollectionAttributes['id'][]
  itemTags?: string[]
  collectionStatus?: CollectionStatus
  /** Subsets of `remoteIds`: approved now, and not approved but touched on-chain since creation. */
  approvedRemoteIds?: CollectionAttributes['id'][]
  reviewedRemoteIds?: CollectionAttributes['id'][]
}

type CollectionStatusParams = Pick<
  FindCollectionParams,
  'remoteIds' | 'approvedRemoteIds' | 'reviewedRemoteIds'
>

type Statement = ReturnType<typeof SQL>

/** `(a OP b OP …)`. */
function joinConditions(conditions: Statement[], operator: 'AND' | 'OR') {
  const result = SQL`(`
  conditions.forEach((condition, index) => {
    result.append(condition)
    if (conditions[index + 1]) {
      result.append(operator === 'AND' ? SQL` AND ` : SQL` OR `)
    }
  })
  return result.append(SQL`)`)
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`)
}

const isStandard = () =>
  SQL`collections.third_party_id is NULL AND collections.urn_suffix is NULL`
const isThirdParty = () =>
  SQL`collections.third_party_id is NOT NULL AND collections.urn_suffix is NOT NULL`
/** A third-party publish keeps the collection's request and stores the new work as pending item requests. */
const hasPendingItemCuration = () =>
  SQL`EXISTS (SELECT 1 FROM ${raw(
    ItemCuration.tableName
  )} pending_item_curations JOIN ${raw(
    Item.tableName
  )} pending_items ON pending_items.id = pending_item_curations.item_id WHERE pending_items.collection_id = collections.id AND pending_item_curations.status = ${
    CurationStatusFilter.PENDING
  })`

/** The on-chain checks the review filters read; a NULL contract address (third-party, unpublished) reads as false. */
function getRemoteChecks({
  remoteIds = [],
  approvedRemoteIds = [],
  reviewedRemoteIds = [],
}: CollectionStatusParams) {
  const isOnChain = SQL`COALESCE(collections.contract_address = ANY(${remoteIds}), false)`
  const isApprovedOnChain = SQL`COALESCE(collections.contract_address = ANY(${approvedRemoteIds}), false)`
  const wasReviewedOnChain = SQL`COALESCE(collections.contract_address = ANY(${reviewedRemoteIds}), false)`
  return {
    isOnChain,
    isApprovedOnChain,
    wasReviewedOnChain,
    isNotApprovedOnChain: SQL`(${isOnChain} AND NOT ${isApprovedOnChain})`,
    hasBeenApproved: SQL`(${isApprovedOnChain} OR ${wasReviewedOnChain})`,
  }
}

export class Collection extends Model<CollectionAttributes> {
  static tableName = 'collections'

  static getOrderByStatement(
    sort?: CollectionSort,
    remoteSets: CollectionStatusParams = {}
  ) {
    switch (sort) {
      case CollectionSort.MOST_RELEVANT:
        // Order should be
        // 1- To review: pending request nobody picked up, or never reviewed
        // 2- Under review: Assigned && has pending curation
        // 3- Approved: Curation approved
        // 4- Rejected: Curation rejected
        return SQL`
          ORDER BY
            CASE WHEN `
          .append(
            this.getCurationStatusCondition(
              CurationStatusFilter.TO_REVIEW,
              remoteSets
            )
          )
          .append(SQL` THEN 0 WHEN `)
          .append(
            this.getCurationStatusCondition(
              CurationStatusFilter.UNDER_REVIEW,
              remoteSets
            )
          )
          .append(
            SQL`
            THEN 1
            WHEN(collection_curations.status = ${CurationStatusFilter.APPROVED})
            THEN 2
              WHEN(collection_curations.status = ${CurationStatusFilter.REJECTED})
            THEN 3
            ELSE 4
          END, collections.created_at DESC, collections.id
        `
          )
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
      case CollectionSort.LAST_ACTIVITY_ASC:
        return SQL`ORDER BY `
          .append(this.getLastActivityStatement())
          .append(SQL` ASC, collections.id`)
      case CollectionSort.LAST_ACTIVITY_DESC:
        return SQL`ORDER BY `
          .append(this.getLastActivityStatement())
          .append(SQL` DESC, collections.id`)
      case CollectionSort.REQUESTED_AT_ASC:
        return SQL`ORDER BY `
          .append(this.getRequestedAtStatement())
          .append(SQL` ASC, collections.id`)
      case CollectionSort.REQUESTED_AT_DESC:
        return SQL`ORDER BY `
          .append(this.getRequestedAtStatement())
          .append(SQL` DESC, collections.id`)

      default:
        return SQL``
    }
  }

  /**
   * The standard collection status, from the latest collection curation and the on-chain state; NULL for
   * third-party collections. A rejected curation wins over the on-chain state. A not approved collection is
   * disabled when a curation approved it, or when it has no curation and was touched on-chain: `reviewedAt`
   * also moves on `rescueItems`, so a pending curation means a first approval in progress, not a disable.
   * Known gap: a first approval without an assigned curator has no curation, so if it stalls between
   * `rescueItems` and `setApproved` it reads as disabled until the approval lands.
   */
  static getStatusStatement({
    remoteIds = [],
    approvedRemoteIds = [],
    reviewedRemoteIds = [],
  }: CollectionStatusParams) {
    return SQL`CASE
      WHEN collections.third_party_id IS NOT NULL THEN NULL
      WHEN NOT COALESCE(collections.contract_address = ANY(${remoteIds}), false) THEN 'draft'
      WHEN collection_curations.status = 'rejected' THEN 'rejected'
      WHEN collections.contract_address = ANY(${approvedRemoteIds}) THEN
        CASE WHEN collection_curations.status = 'pending' THEN 'under_review' ELSE 'published' END
      WHEN collection_curations.status = 'approved'
        OR (collection_curations.id IS NULL AND collections.contract_address = ANY(${reviewedRemoteIds}))
        THEN 'disabled'
      ELSE 'under_review'
    END`
  }

  /** The collections findAll and countByStatus read from, narrowed to the published or unpublished ones when asked. */
  static getCollectionsSourceStatement(isPublished: boolean | undefined) {
    return SQL`(
      SELECT DISTINCT on (c.id) c.* FROM ${raw(Collection.tableName)} c
    `
      .append(this.getPublishedJoinStatement(isPublished))
      .append(SQL`) collections`)
  }

  /**
   * When the latest review was requested: the newest pending item request, else the newest item request of any
   * status (a third-party publish reuses the collection's request, so its own date is the first publish), else
   * the collection's request, else its creation for one never reviewed.
   */
  static getRequestedAtStatement() {
    const newestItemRequest = (status?: CurationStatusFilter) =>
      SQL`(SELECT MAX(item_curations.created_at) FROM ${raw(
        ItemCuration.tableName
      )} item_curations JOIN ${raw(
        Item.tableName
      )} items ON items.id = item_curations.item_id WHERE items.collection_id = collections.id`
        .append(status ? SQL` AND item_curations.status = ${status}` : SQL``)
        .append(SQL`)`)
    return SQL`COALESCE(`
      .append(newestItemRequest(CurationStatusFilter.PENDING))
      .append(SQL`, `)
      .append(newestItemRequest())
      .append(SQL`, collection_curations.created_at, collections.created_at)`)
  }

  /** When the collection, any of its items or its latest curation last changed. */
  static getLastActivityStatement() {
    return SQL`GREATEST(
      collections.updated_at,
      (SELECT MAX(items.updated_at) FROM ${raw(
        Item.tableName
      )} items WHERE items.collection_id = collections.id),
      collection_curations.updated_at
    )`
  }

  static getLatestCurationJoinStatement() {
    return SQL`
      LEFT JOIN
        (SELECT DISTINCT on (cc.collection_id) cc.* FROM ${raw(
          CollectionCuration.tableName
        )} cc ORDER BY cc.collection_id, cc.created_at DESC) collection_curations
        ON collection_curations.collection_id = collections.id
    `
  }

  /**
   * One review status as the committee filters by it, from the latest curation and the on-chain sets. The
   * rules follow `getStatusStatement`: a rejected request wins, a pending one reads as to review or under
   * review by its assignee whatever the on-chain state, and `pending` keeps its legacy meaning (waiting
   * for a first approval).
   */
  static getCurationStatusCondition(
    status: CurationStatusFilter,
    remoteSets: CollectionStatusParams
  ) {
    const {
      isOnChain,
      isApprovedOnChain,
      isNotApprovedOnChain,
      wasReviewedOnChain,
    } = getRemoteChecks(remoteSets)
    const hasNoCuration = SQL`collection_curations.id is NULL`
    const isPendingOrNew = SQL`(collection_curations.status = ${CurationStatusFilter.PENDING} OR ${hasNoCuration})`
    switch (status) {
      case CurationStatusFilter.PENDING:
        return SQL`((collection_curations.status = ${status} AND (${isNotApprovedOnChain} OR (${isThirdParty()}))) OR (${hasNoCuration} AND ${isNotApprovedOnChain}))`
      case CurationStatusFilter.APPROVED:
        return SQL`((collection_curations.status = ${status} AND (${isApprovedOnChain} OR (${isThirdParty()}))) OR (${hasNoCuration} AND ${isApprovedOnChain}))`
      case CurationStatusFilter.REJECTED:
        return SQL`(collection_curations.status = ${status} AND (${isOnChain} OR (${isThirdParty()})))`
      case CurationStatusFilter.TO_REVIEW:
        return SQL`(collection_curations.assignee is NULL AND (((${isThirdParty()}) AND (${isPendingOrNew} OR ${hasPendingItemCuration()})) OR (${isStandard()} AND ${isOnChain} AND (collection_curations.status = ${
          CurationStatusFilter.PENDING
        } OR (${hasNoCuration} AND NOT ${isApprovedOnChain} AND NOT ${wasReviewedOnChain})))))`
      case CurationStatusFilter.UNDER_REVIEW:
        return SQL`(collection_curations.assignee is NOT NULL AND (collection_curations.status = ${
          CurationStatusFilter.PENDING
        } OR ((${isThirdParty()}) AND ${hasPendingItemCuration()})))`
      case CurationStatusFilter.DISABLED:
        return SQL`(${isNotApprovedOnChain} AND (collection_curations.status = ${CurationStatusFilter.APPROVED} OR (${hasNoCuration} AND ${wasReviewedOnChain})))`
      default:
        return assertNever(status)
    }
  }

  static getFindAllWhereStatement({
    q,
    contractAddress,
    assignees,
    statuses,
    reviewType,
    type,
    address,
    thirdPartyIds,
    remoteIds,
    collectionStatus,
    approvedRemoteIds,
    reviewedRemoteIds,
  }: Pick<
    FindCollectionParams,
    | 'q'
    | 'contractAddress'
    | 'assignees'
    | 'statuses'
    | 'reviewType'
    | 'type'
    | 'address'
    | 'thirdPartyIds'
    | 'remoteIds'
    | 'collectionStatus'
    | 'approvedRemoteIds'
    | 'reviewedRemoteIds'
  >) {
    if (
      !q &&
      !contractAddress &&
      !assignees?.length &&
      !statuses?.length &&
      !reviewType &&
      !type &&
      !address &&
      !thirdPartyIds?.length &&
      !collectionStatus
    ) {
      return SQL``
    }
    const search = `%${q}%`
    const isInRemoteIds = SQL`collections.contract_address = ANY(${remoteIds})`
    const remoteSets = { remoteIds, approvedRemoteIds, reviewedRemoteIds }
    // A third-party collection has no contract address, so it never counts as approved and reads as new.
    const { hasBeenApproved } = getRemoteChecks(remoteSets)
    const curatorAddresses = assignees?.filter(
      (assignee) => assignee !== UNASSIGNED_FILTER
    )
    const assigneeConditions = [
      curatorAddresses?.length
        ? SQL`collection_curations.assignee = ANY(${curatorAddresses})`
        : undefined,
      assignees?.includes(UNASSIGNED_FILTER)
        ? SQL`collection_curations.assignee is NULL`
        : undefined,
    ].filter((condition): condition is Statement => !!condition)
    const conditions = [
      q ? SQL`collections.name ILIKE ${search} ` : undefined,
      contractAddress
        ? SQL`LOWER(collections.contract_address) = ${contractAddress.toLowerCase()}`
        : undefined,
      assigneeConditions.length
        ? joinConditions(assigneeConditions, 'OR')
        : undefined,
      address
        ? thirdPartyIds?.length
          ? SQL`(collections.eth_address = ${address} OR third_party_id = ANY(${thirdPartyIds}) OR ${isInRemoteIds})`
          : SQL`(collections.eth_address = ${address} OR ${isInRemoteIds})`
        : undefined,
      statuses?.length
        ? joinConditions(
            statuses.map((status) =>
              this.getCurationStatusCondition(status, remoteSets)
            ),
            'OR'
          )
        : undefined,
      reviewType
        ? reviewType === ReviewTypeFilter.UPDATES
          ? hasBeenApproved
          : SQL`NOT ${hasBeenApproved}`
        : undefined,
      type
        ? type === CollectionTypeFilter.STANDARD
          ? isStandard()
          : type === CollectionTypeFilter.THIRD_PARTY
          ? isThirdParty()
          : SQL``
        : undefined,
      collectionStatus
        ? SQL`(`
            .append(
              this.getStatusStatement({
                remoteIds,
                approvedRemoteIds,
                reviewedRemoteIds,
              })
            )
            .append(SQL`) = ${collectionStatus}`)
        : undefined,
    ].filter((condition): condition is Statement => !!condition)

    if (!conditions.length) {
      return SQL``
    }

    return SQL`WHERE `.append(joinConditions(conditions, 'AND'))
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
    return `SELECT NOT EXISTS 
      (SELECT mappings_info.is_mapping_complete FROM
        (SELECT DISTINCT ON (items.id) items.id, item_curations.updated_at, item_curations.is_mapping_complete, items.mappings
          FROM ${Item.tableName} items
          LEFT JOIN ${ItemCuration.tableName} item_curations ON items.id = item_curations.item_id
          WHERE items.collection_id = collections.id
          ORDER BY items.id, item_curations.updated_at DESC) mappings_info
        WHERE mappings_info.is_mapping_complete = false
          OR (mappings_info.is_mapping_complete IS NULL AND mappings_info.updated_at IS NOT NULL AND mappings_info.mappings IS NOT NULL)
          OR mappings_info.mappings IS NULL)
      OR NOT EXISTS (SELECT 1 FROM ${Item.tableName} items WHERE items.collection_id = collections.id)`
  }

  /**
   * Finds all the Collections that given parameters. It sorts and paginates the results.
   * The review filters (statuses, review type) read the on-chain state from `remoteIds`, `approvedRemoteIds`
   * and `reviewedRemoteIds`; MOST_RELEVANT puts the ones to review first.
   *
   * @param limit - limit param to paginate the query
   * @param offset - offset param to paginate the query
   * @param sort - the type of sorting to apply. MOST_RELEVANT will return the NOT approved first.
   * @param isPublished - if true, will return only the published collections. If false, will return only the unpublished collections.
   * @param q - the query to search for.
   * @param assignees - the assignees to filter by, any of them.
   * @param statuses - the review statuses to filter by, any of them.
   * @param reviewType - new collections or updates to approved ones.
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
      SELECT collections.*, collection_curations.status as curation_status, ${this.getLastActivityStatement()} as last_activity_at, COUNT(*) OVER() as collection_count, (SELECT COUNT(*) FROM ${raw(
      Item.tableName
    )}
        WHERE items.collection_id = collections.id) as item_count,
        (${raw(this.isMappingCompleteTableStatement())}) as is_mapping_complete
        FROM ${this.getCollectionsSourceStatement(isPublished)}
        ${this.getLatestCurationJoinStatement()}
        ${
          whereFilters.itemTags
            ? this.getItemsTagJoinStatement(whereFilters.itemTags)
            : SQL``
        }
        ${SQL`${this.getFindAllWhereStatement(whereFilters)}`}
        ${SQL`${this.getOrderByStatement(sort, whereFilters)}`}
        LIMIT ${limit}
        OFFSET ${offset}
      `
    return this.query<CollectionWithCounts>(query)
  }

  /** How many collections match the filters in each status, ignoring the status filter itself. */
  static async countByStatus(
    params: FindCollectionParams
  ): Promise<CollectionStatusCounts> {
    const { isPublished, itemTags, ...rest } = params
    const whereFilters = { ...rest, collectionStatus: undefined }
    const rows = await this.query<{ status: CollectionStatus; count: string }>(
      SQL`SELECT status, COUNT(*) as count FROM (SELECT `
        .append(this.getStatusStatement(whereFilters))
        .append(SQL` as status FROM `)
        .append(this.getCollectionsSourceStatement(isPublished))
        .append(this.getLatestCurationJoinStatement())
        .append(itemTags ? this.getItemsTagJoinStatement(itemTags) : SQL``)
        .append(this.getFindAllWhereStatement(whereFilters))
        .append(SQL`) statuses WHERE status IS NOT NULL GROUP BY status`)
    )
    const counts = Object.fromEntries(
      Object.values(CollectionStatus).map((status) => [status, 0])
    ) as CollectionStatusCounts
    for (const { status, count } of rows) {
      counts[status] = Number(count)
    }
    return counts
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
    SELECT *, (${raw(
      this.isMappingCompleteTableStatement()
    )}) as is_mapping_complete, (SELECT COUNT(*) FROM ${raw(
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
    collection: UpsertableCollectionAttributes
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
      RETURNING *, (${this.isMappingCompleteTableStatement()}) as is_mapping_complete, (SELECT COUNT(*) FROM ${
        Item.tableName
      } WHERE collections.id = items.collection_id) as item_count`,
      columnValues
    )

    return result[0]
  }
}
