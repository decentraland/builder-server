import { Model, raw, SQL } from 'decentraland-server'
import { Item } from '../../Item'
import { CurationType } from '../Curation.types'
import { CollectionCurationAttributes } from './CollectionCuration.types'

export class CollectionCuration extends Model<CollectionCurationAttributes> {
  static tableName = 'collection_curations'
  static type = CurationType.COLLECTION

  static async updateByItemId(itemId: string): Promise<{ rowCount: number }> {
    const columns = await this.query(SQL`
      UPDATE ${raw(CollectionCuration.tableName)} as collection_curations
      SET updated_at = ${new Date()}
      FROM ${raw(Item.tableName)} as items
      WHERE collection_curations.collection_id = items.collection_id
        AND items.id = ${itemId}`)

    return columns.length > 0 ? columns[0].rowCount : 0
  }
}
