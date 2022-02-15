import { Model, raw, SQL } from 'decentraland-server'
import { Collection } from '../../Collection'
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

  static async findDistinctByItemIdsAndStatus(
    itemIds: string[],
    curationStatus: CurationStatus
  ) {
    return this.query<ItemCurationAttributes>(SQL`
    SELECT DISTINCT ON(item_id) *
      FROM ${raw(this.tableName)}
      WHERE item_id = ANY(${itemIds})
        AND status = ${curationStatus}`)
  }

  static async findByCollectionId(collectionId: string) {
    return this.query<ItemCurationAttributes>(SQL`
    SELECT ic.*
      FROM ${raw(this.tableName)} ic
      INNER JOIN ${raw(
        Item.tableName
      )} i ON i.id = ic.item_id AND i.collection_id = ${collectionId}`)
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
