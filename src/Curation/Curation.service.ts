import { raw, SQL } from 'decentraland-server'
import { hasAccess as hasCollectionAccess } from '../Collection/access'
import { getMergedCollection } from '../Collection/utils'
import { hasAccess as hasItemAccess } from '../Item/access'
import { getMergedItem } from '../Item/utils'
import { CollectionCuration } from './CollectionCuration'
import { CurationType } from './Curation.types'
import { ItemCuration } from './ItemCuration'

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

  async hasAccess(id: string, ethAddress: string) {
    switch (this.type) {
      case CurationType.COLLECTION: {
        const collection = await getMergedCollection(id)
        console.log('collection ->', collection)
        return collection && hasCollectionAccess(ethAddress, collection)
      }
      case CurationType.ITEM: {
        const item = await getMergedItem(id)
        const collection = item.collection_id
          ? await getMergedCollection(item.collection_id)
          : undefined
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
