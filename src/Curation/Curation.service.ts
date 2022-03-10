import { raw, SQL } from 'decentraland-server'
import { hasAccess as hasCollectionAccess } from '../Collection/access'
import { getMergedCollection } from '../Collection/utils'
import { hasAccess as hasItemAccess } from '../Item/access'
import { getMergedItem } from '../Item/utils'
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
    const columnName = this.getForeingColumnName()
    return this.getModel().query(
      SQL`SELECT DISTINCT ON (${raw(columnName)}) *
        FROM ${raw(this.getTableName())} AS t1
        WHERE ${this.getLatestCreatedAtQuery()}`
    )
  }

  async getLatestByIds(ids: string[]) {
    const columnName = this.getForeingColumnName()
    return this.getModel().query(
      SQL`SELECT DISTINCT ON (${raw(columnName)}) *
        FROM ${raw(this.getTableName())} AS t1
        WHERE ${raw(columnName)} = ANY(${ids})
          AND ${this.getLatestCreatedAtQuery()}`
    )
  }

  async getLatestById(id: string) {
    const columnName = this.getForeingColumnName()
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
    const assignmentFields = Object.keys(fields)
      .map((column, index) => `"${column}" = $${index + 1}`)
      .join(', ')

    const result = await this.getModel().query(
      ` UPDATE ${this.getTableName()}
        SET ${assignmentFields}
        WHERE id = $${Object.keys(fields).length + 1}
        RETURNING *
      `,
      [...Object.values(fields), id]
    )

    return result[0]
  }

  async hasAccess(id: string, ethAddress: string) {
    switch (this.type) {
      case CurationType.COLLECTION: {
        const collection = await getMergedCollection(id)
        return collection && hasCollectionAccess(ethAddress, collection)
      }
      case CurationType.ITEM: {
        const item = await getMergedItem(id)
        const collection = await getMergedCollection(item.collection_id!) // the item WILL have an id here, otherwise getMergedItem throws
        return hasItemAccess(ethAddress, item, collection)
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
    const columnName = this.getForeingColumnName()
    return SQL`created_at = (
      SELECT MAX(created_at) FROM ${raw(this.getTableName())} AS t2
      WHERE t1.${raw(columnName)} = t2.${raw(columnName)}
    )`
  }

  private getTableName() {
    return this.CurationModel.tableName
  }

  private getForeingColumnName(): 'collection_id' | 'item_id' {
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
