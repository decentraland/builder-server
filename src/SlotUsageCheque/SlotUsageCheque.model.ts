import { Model, raw, SQL } from 'decentraland-server'
import { Collection } from '../Collection'

import { SlotUsageChequeAttributes } from './SlotUsageCheque.types'

export class SlotUsageCheque extends Model<SlotUsageChequeAttributes> {
  static tableName = 'slot_usage_cheques'

  static async findLastByCollectionId(
    collectionId: string
  ): Promise<SlotUsageChequeAttributes | undefined> {
    const result = await this.query<SlotUsageChequeAttributes>(SQL`
      SELECT slot_usage_cheque.*
      FROM ${raw(this.tableName)} slot_usage_cheque
      INNER JOIN ${raw(
        Collection.tableName
      )} collection ON collection.id = slot_usage_cheque.collection_id AND collection.id = ${collectionId} 
      ORDER BY slot_usage_cheque.created_at DESC
      LIMIT 1`)

    return result[0]
  }
}
