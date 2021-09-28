import { CollectionAttributes } from '../Collection/Collection.types'
import { getDecentralandCollectionURN } from '../Collection/utils'
import { ItemAttributes } from './Item.types'

export function getDecentralandItemURN(
  item: ItemAttributes,
  collection: CollectionAttributes
): string {
  return `${getDecentralandCollectionURN(collection)}:${item.id}`
}
