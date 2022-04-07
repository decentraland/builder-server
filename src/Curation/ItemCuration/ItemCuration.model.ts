import { Model, raw, SQL } from 'decentraland-server'
import { Collection } from '../../Collection'
import { Item } from '../../Item'
import { CurationStatus, CurationType } from '../Curation.types'
import {
  ItemCurationAttributes,
  ItemCurationWithTotalCount,
} from './ItemCuration.types'

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
      FROM ${raw(this.tableName)} item_curations
      JOIN ${raw(Item.tableName)} items ON items.id = item_curations.item_id
      WHERE items.collection_id = ${collectionId}`)

    return counts[0].count > 0
  }

  static async findByCollectionAndItemIds(
    collectionId: string,
    itemIds: string[]
  ) {
    return this.query<ItemCurationWithTotalCount>(SQL`
      SELECT DISTINCT on (item.id) item_curation.*
        FROM ${raw(this.tableName)} item_curation
        INNER JOIN ${raw(
          Item.tableName
        )} item ON item.id = item_curation.item_id AND item.collection_id = ${collectionId} 
        WHERE item.id = ANY(${itemIds})
        ORDER BY item.id, item_curation.created_at DESC
    `)
  }

  static async findByCollectionId(collectionId: string) {
    return this.query<ItemCurationWithTotalCount>(SQL`
      SELECT DISTINCT on (item.id) item_curation.*
        FROM ${raw(this.tableName)} item_curation
        INNER JOIN ${raw(
          Item.tableName
        )} item ON item.id = item_curation.item_id AND item.collection_id = ${collectionId} 
        ORDER BY item.id, item_curation.created_at DESC
  `)
  }

  static async findLastByCollectionId(
    collectionId: string
  ): Promise<ItemCurationAttributes | undefined> {
    const itemCurations = await this.findByCollectionId(collectionId)
    return itemCurations[0]
  }

  static async findLastCreatedByCollectionIdAndStatus(
    collectionId: string,
    curationStatus: CurationStatus
  ): Promise<ItemCurationAttributes | undefined> {
    const itemCurations = await this.query<ItemCurationAttributes>(SQL`
    SELECT item_curations.*
      FROM ${raw(this.tableName)} item_curations
      JOIN ${raw(Item.tableName)} items ON items.id = item_curations.item_id
      WHERE items.collection_id = ${collectionId}
        AND item_curations.status = ${curationStatus}
      ORDER BY item_curations.created_at DESC
      LIMIT 1`)

    return itemCurations[0]
  }

  static async deleteByIds(ids: string[]) {
    return this.query(SQL`
      DELETE FROM ${raw(this.tableName)}
        WHERE id = ANY(${ids})`)
  }

  static async countByThirdPartyId(thirdPartyId: string) {
    const counts = await this.query<{ count: number }>(
      SQL`SELECT COUNT(DISTINCT items.id) AS Count
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
