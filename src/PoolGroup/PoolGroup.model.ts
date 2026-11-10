import { Model } from 'decentraland-server'

import { PoolGroupAttributes } from './PoolGroup.types'

export class PoolGroup extends Model<PoolGroupAttributes> {
  static tableName = 'pool_groups'
}
