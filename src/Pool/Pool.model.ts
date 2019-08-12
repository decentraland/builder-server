import { Model } from 'decentraland-server'

import { PoolAttributes } from './Pool.types'

export class Pool extends Model<PoolAttributes> {
  static tableName = 'pools'
}
