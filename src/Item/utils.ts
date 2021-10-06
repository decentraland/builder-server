import { utils } from 'decentraland-commons'
import { FullItem, ItemAttributes } from './Item.types'

export function toDBItem(item: FullItem): ItemAttributes {
  return utils.omit(item, [
    'is_published',
    'is_approved',
    'in_catalyst',
    'total_supply',
    'content_hash',
  ])
}
