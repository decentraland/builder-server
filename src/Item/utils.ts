import { utils } from 'decentraland-commons'
import { decodeThirdPartyItemURN, isTPItemURN } from '../utils/urn'
import {
  FullItem,
  ItemAttributes,
  ThirdPartyItemAttributes,
} from './Item.types'

export const MAX_FORUM_ITEMS = 20

export function toDBItem(item: FullItem): ItemAttributes {
  const attributes = {
    ...item,
    urn_suffix:
      item.urn && isTPItemURN(item.urn)
        ? decodeThirdPartyItemURN(item.urn).item_urn_suffix
        : null,
  }
  return utils.omit(attributes, [
    'urn',
    'is_published',
    'is_approved',
    'in_catalyst',
    'total_supply',
    'content_hash',
    'blockchain_item_id',
  ])
}

export function buildTPItemURN(
  thirdPartyId: string,
  collectionURNSuffix: string,
  itemURNSuffix: string
): string {
  return `${thirdPartyId}:${collectionURNSuffix}:${itemURNSuffix}`
}

export function isTPItem(
  item: ItemAttributes
): item is ThirdPartyItemAttributes {
  return item.urn_suffix !== null && item.collection_id !== null
}
