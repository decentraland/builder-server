import { Model } from 'decentraland-server'

import { PoolLikeAttributes } from './PoolLike.types'

export class PoolLike extends Model<PoolLikeAttributes> {
  static tableName = 'pool_likes'
  static primaryKey = 'pool_id'
  static withTimestamps = false
}
