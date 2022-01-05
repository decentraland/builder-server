import { Model } from 'decentraland-server'
import { CurationType } from '../Curation.types'
import { CollectionCurationAttributes } from './CollectionCuration.types'

export class CollectionCuration extends Model<CollectionCurationAttributes> {
  static tableName = 'collection_curations'
  static type = CurationType.COLLECTION
}
