import { utils } from 'decentraland-commons'
import { getDecentralandCollectionURN } from '../Collection/utils'
import { FullItem, ItemAttributes } from './Item.types'

export function getDecentralandItemURN(
  item: ItemAttributes,
  collectionAddress: string
): string {
  return `${getDecentralandCollectionURN(collectionAddress)}:${
    item.blockchain_item_id
  }`
}

export function toDBItem(item: FullItem): ItemAttributes {
  const attributes = {
    ...item,
    urn_suffix: null,
  }
  return utils.omit(attributes, [
    'urn',
    'is_published',
    'is_approved',
    'in_catalyst',
    'total_supply',
    'content_hash',
  ])
}

export function buildTPItemURN(
  thirdPartyId: string,
  collectionURNSuffix: string,
  itemURNSuffix: string
): string {
  return `${thirdPartyId}:${collectionURNSuffix}:${itemURNSuffix}`
}

export function isTPItem(item: ItemAttributes): boolean {
  return item.urn_suffix !== null && item.collection_id !== null
}

// TODO: @TPW: implement this
export function getMergedItem(_id: string): Promise<FullItem> {
  return {} as any
}
