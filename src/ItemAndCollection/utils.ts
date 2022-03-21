import { CollectionAttributes } from '../Collection/Collection.types'
import { ItemAttributes } from '../Item/Item.types'

export function isStandardItemPublished(
  item: ItemAttributes,
  collection: CollectionAttributes
): boolean {
  return !!item.blockchain_item_id && !!collection.contract_address
}
