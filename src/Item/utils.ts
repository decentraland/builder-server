import { getDecentralandCollectionURN } from '../Collection/utils'
import { ItemAttributes } from './Item.types'

export function getDecentralandItemURN(
  item: ItemAttributes,
  collectionAddress: string
): string {
  return `${getDecentralandCollectionURN(collectionAddress)}:${
    item.blockchain_item_id
  }`
}
