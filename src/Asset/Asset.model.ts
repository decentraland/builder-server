import { Model } from 'decentraland-server'

import { AssetAttributes } from './Asset.types'

export class Asset extends Model<AssetAttributes> {
  static tableName = 'assets'
}
