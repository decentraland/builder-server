import { Model } from 'decentraland-server'

import { CollectionAttributes } from './Collection.types'

export class Collection extends Model<CollectionAttributes> {
  static tableName = 'collections'
}
