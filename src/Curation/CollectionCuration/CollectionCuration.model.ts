import { Model, raw, SQL } from 'decentraland-server'
import { Item } from '../../Item'
import { CurationType } from '../Curation.types'
import { CollectionCurationAttributes } from './CollectionCuration.types'

export class CollectionCuration extends Model<CollectionCurationAttributes> {
  static tableName = 'collection_curations'
  static type = CurationType.COLLECTION

  static async findByItemId(
    itemId: string
  ): Promise<CollectionCurationAttributes | undefined> {
    const curations = await this.query<CollectionCurationAttributes>(SQL`
      SELECT cc.*
        FROM ${raw(this.tableName)} cc
        INNER JOIN ${raw(
          Item.tableName
        )} i ON i.id = i.collection_id AND i.id = ${itemId}`)

    return curations[0]
  }
}
