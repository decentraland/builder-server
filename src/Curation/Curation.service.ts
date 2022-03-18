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

  async getLatest() {
    const columnName = this.getForeignColumnName()
    return this.getModel().query(
      SQL`SELECT DISTINCT ON (${raw(columnName)}) *
        FROM ${raw(this.getTableName())} AS t1
        WHERE ${this.getLatestCreatedAtQuery()}`
    )
  }

  async getLatestByIds(ids: string[]) {
    const columnName = this.getForeignColumnName()
    return this.getModel().query(
      SQL`SELECT DISTINCT ON (${raw(columnName)}) *
        FROM ${raw(this.getTableName())} AS t1
        WHERE ${raw(columnName)} = ANY(${ids})
          AND ${this.getLatestCreatedAtQuery()}`
    )
  }

  async getLatestById(id: string) {
    const columnName = this.getForeignColumnName()
    const result = await this.getModel().query(
      SQL`SELECT *
        FROM ${raw(this.getTableName())}
        WHERE ${raw(columnName)} = ${id}
        ORDER BY created_at DESC
        LIMIT 1`
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

  async hasAccess(id: string, ethAddress: string) {
    const collection =
      this.type === CurationType.ITEM
        ? await Collection.findByItemId(id)
        : await Collection.findOne<CollectionAttributes>({ id })

    if (!collection) {
      throw new NonExistentCollectionError()
    }
    const mergedCollection = await getMergedCollection(collection)

    switch (this.type) {
      case CurationType.COLLECTION: {
        return hasCollectionAccess(ethAddress, mergedCollection)
      }
      case CurationType.ITEM: {
        return hasItemAccess(ethAddress, id, mergedCollection)
      }
      default:
        throw new Error(`Invalid type ${this.type}`)
    }
  }

  // TODO: Maybe we can implement some of the Model methods here and type them, like query and create
  getModel() {
    return this.CurationModel
  }

  private getLatestCreatedAtQuery() {
    const columnName = this.getForeignColumnName()
    return SQL`created_at = (
      SELECT MAX(created_at) FROM ${raw(this.getTableName())} AS t2
      WHERE t1.${raw(columnName)} = t2.${raw(columnName)}
    )`
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
