import { Model, raw, SQL } from 'decentraland-server'
import { Item } from '../../Item'
import { CurationType } from '../Curation.types'
import { ItemCurationAttributes } from './ItemCuration.types'

export class ItemCuration extends Model<ItemCurationAttributes> {
  static tableName = 'item_curations'
  static type = CurationType.ITEM

  static async findByCollectionId(collectionId: string) {
    // prettier-ignore
    return this.query<ItemCurationAttributes>(SQL`
    SELECT ic.*
      FROM ${raw(this.tableName)} ic
      INNER JOIN ${raw(Item.tableName)} i ON i.id = ic.item_id AND i.collection_id = ${collectionId}`)
  }
}
