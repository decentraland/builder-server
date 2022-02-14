import { Model, raw, SQL } from 'decentraland-server'
import { Item } from '../../Item'
import { CurationStatus, CurationType } from '../Curation.types'
import { ItemCurationAttributes } from './ItemCuration.types'

export class ItemCuration extends Model<ItemCurationAttributes> {
  static tableName = 'item_curations'
  static type = CurationType.ITEM

  static async existsByItemId(itemId: string): Promise<boolean> {
    const counts = await this.query<{ count: number }>(SQL`
    SELECT COUNT(*) as count
      FROM ${raw(this.tableName)}
      WHERE item_id = ${itemId}`)

    return counts[0].count > 0
  }

  static async existsByCollectionId(collectionId: string): Promise<boolean> {
    const counts = await this.query<{ count: number }>(SQL`
    SELECT COUNT(*) as count
      FROM ${raw(this.tableName)} c
      JOIN ${raw(Item.tableName)} i ON i.id = c.item_id
      WHERE i.collection_id = ${collectionId}`)

    return counts[0].count > 0
  }

  static async findLastCreatedByCollectionIdAndStatus(
    collectionId: string,
    curationStatus: CurationStatus
  ): Promise<ItemCurationAttributes | undefined> {
    const itemCurations = await this.query<ItemCurationAttributes>(SQL`
    SELECT *
      FROM ${raw(this.tableName)} c
      JOIN ${raw(Item.tableName)} i ON i.id = c.item_id
      WHERE i.collection_id = ${collectionId}
        AND i.status = ${curationStatus}
      ORDER BY created_at DESC
      LIMIT 1`)

    return itemCurations[0]
  }

  static async findByCollectionId(collectionId: string) {
    return this.query<ItemCurationAttributes>(SQL`
    SELECT ic.*
      FROM ${raw(this.tableName)} ic
      INNER JOIN ${raw(
        Item.tableName
      )} i ON i.id = ic.item_id AND i.collection_id = ${collectionId}`)
  }
}
