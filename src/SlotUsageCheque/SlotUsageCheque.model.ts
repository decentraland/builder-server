import { Model } from 'decentraland-server'

import { SlotUsageChequeAttributes } from './SlotUsageCheque.types'

export class SlotUsageCheque extends Model<SlotUsageChequeAttributes> {
  static tableName = 'slot_usage_cheques'
}
