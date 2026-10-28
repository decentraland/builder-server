import { raw, SQL } from 'decentraland-server'
import { database } from '../database/database'
import { hasAccess as hasCollectionAccess } from '../Collection/access'
import { hasAccess as hasItemAccess } from '../Item/access'
import { NonExistentCollectionError } from '../Collection/Collection.errors'
import { Collection, CollectionAttributes } from '../Collection'
import { getMergedCollection } from '../Collection/utils'
import {
  CollectionCuration,
  CollectionCurationAttributes,
  OnChainApproval,
} from './CollectionCuration'
import { ItemCuration, ItemCurationAttributes } from './ItemCuration'
import { CurationType } from './Curation.types'

// TODO: This class SHOULD NOT make database queries. It's useful but it breakes the convention we have where only model know about queries
export class CurationService<
  T extends typeof CollectionCuration | typeof ItemCuration
> {
  public type: CurationType

  // TODO: Type this better (or remove it completely and use+mock new CurationService)
  static byType(type: CurationType): CurationService<any> {
    switch (type) {
      case CurationType.COLLECTION:
        return new CurationService(CollectionCuration)
      case CurationType.ITEM:
        return new CurationService(ItemCuration)
      default:
        throw new Error(`Invalid curation type ${type}`)
    }
  }

  constructor(public CurationModel: T) {
    switch (CurationModel) {
      case CollectionCuration:
        this.type = CurationType.COLLECTION
        break
      case ItemCuration:
        this.type = CurationType.ITEM
        break
      default:
        throw new Error(`Invalid curation model ${CurationModel}`)
    }
  }

  /** The latest request of every collection or item; `approvals` only matter for collections. */
  async getLatest(approvals: OnChainApproval[] = []) {
    return this.getModel().query(
      SQL`SELECT * FROM `.append(this.getLatestSourceStatement(approvals))
    )
  }

  async getLatestByIds(ids: string[], approvals: OnChainApproval[] = []) {
    const columnName = this.getForeignColumnName()
    return this.getModel().query(
      SQL`SELECT * FROM `
        .append(this.getLatestSourceStatement(approvals))
        .append(SQL` WHERE ${raw(columnName)} = ANY(${ids})`)
    )
  }

  async getLatestById(id: string, approvals: OnChainApproval[] = []) {
    const columnName = this.getForeignColumnName()
    const result = await this.getModel().query(
      SQL`SELECT * FROM `
        .append(this.getLatestSourceStatement(approvals))
        .append(SQL` WHERE ${raw(columnName)} = ${id}`)
    )
    return result[0]
  }

  async updateById(
    id: string,
    fields: Partial<CollectionCurationAttributes & ItemCurationAttributes>
  ) {
    const assignmentFields = database.toAssignmentFields(fields, 1) // offset the id

    const result = await this.getModel().query(
      ` UPDATE ${this.getTableName()}
        SET ${assignmentFields}
        WHERE id = $1
        RETURNING *
      `,
      [id, ...Object.values(fields)]
    )

    return result[0]
  }

  /** The collection (an item's for item curations) as the chain sees it. */
  async getMergedCollection(id: string): Promise<CollectionAttributes> {
    const collection =
      this.type === CurationType.ITEM
        ? await Collection.findByItemId(id)
        : await Collection.findOne<CollectionAttributes>({ id })

    if (!collection) {
      throw new NonExistentCollectionError()
    }
    return getMergedCollection(collection)
  }

  async hasAccess(
    id: string,
    ethAddress: string,
    mergedCollection?: CollectionAttributes
  ) {
    const collection = mergedCollection ?? (await this.getMergedCollection(id))

    switch (this.type) {
      case CurationType.COLLECTION: {
        return hasCollectionAccess(ethAddress, collection)
      }
      case CurationType.ITEM: {
        return hasItemAccess(ethAddress, id, collection)
      }
      default:
        throw new Error(`Invalid type ${this.type}`)
    }
  }

  // TODO: Maybe we can implement some of the Model methods here and type them, like query and create
  getModel() {
    return this.CurationModel
  }

  /** The latest request per collection or item, aliased as the curation table so callers filter by its columns. */
  private getLatestSourceStatement(approvals: OnChainApproval[]) {
    if (this.type === CurationType.COLLECTION) {
      return CollectionCuration.getLatestStatement(approvals)
    }
    return SQL`(SELECT DISTINCT ON (item_id) * FROM ${raw(
      ItemCuration.tableName
    )} ORDER BY item_id, created_at DESC) ${raw(ItemCuration.tableName)}`
  }

  private getTableName() {
    return this.CurationModel.tableName
  }

  private getForeignColumnName(): 'collection_id' | 'item_id' {
    switch (this.type) {
      case CurationType.COLLECTION:
        return 'collection_id'
      case CurationType.ITEM:
        return 'item_id'
      default:
        throw new Error(`Invalid type ${this.type}`)
    }
  }
}
