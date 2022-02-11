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

  static async getItemCurationCountByThirdPartyId(thirdPartyId: string) {
    const counts = await this.query<{ count: number }>(
      SQL`SELECT COUNT(DISTINCT item_curations.id) AS Count
        FROM ${raw(ItemCuration.tableName)} AS item_curations
        JOIN ${raw(Item.tableName)} AS items ON items.id=item_curations.item_id
        JOIN ${raw(
          Collection.tableName
        )} AS collections ON collections.id=items.collection_id
        WHERE collections.third_party_id=${thirdPartyId}`
    )
    return counts[0].count
  }
}
