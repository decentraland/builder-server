import { Model, raw, SQL } from 'decentraland-server'
import { Collection } from '../../Collection'
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

  static async getItemCurationCountByThirdPartyId(
    thirdPartyId: string
  ): Promise<{ count: number }[]> {
    return this.query(
      SQL`SELECT COUNT(DISTINCT ${raw(ItemCuration.tableName)}.id) as Count
        FROM ${raw(ItemCuration.tableName)}
        JOIN ${raw(Item.tableName)} ON ${raw(Item.tableName)}.id=${raw(
        ItemCuration.tableName
      )}.item_id
        JOIN ${raw(Collection.tableName)} ON ${raw(
        Collection.tableName
      )}.id=${raw(Item.tableName)}.collection_id
        WHERE ${raw(Collection.tableName)}.third_party_id=${thirdPartyId}`
    )
  }
}
