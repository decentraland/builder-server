import { utils } from 'decentraland-commons'
import { getDecentralandCollectionURN } from '../Collection/utils'
import { matchers } from '../common/matchers'
import { FullItem, ItemAttributes } from './Item.types'

const tpwItemURNRegex = new RegExp(
  `^${matchers.baseURN}:collections-thirdparty:(${matchers.urnSlot}):(${matchers.urnSlot})$`
)

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

// TODO: see if we need to use it
export function decodeTPItemURN(
  urn: string
): { collectionId: string; itemId: string } {
  const matches = tpwItemURNRegex.exec(urn)
  if (matches === null || matches.length !== 2) {
    throw new Error('The given collection URN is not TWP compliant')
  }

  return { collectionId: matches[0], itemId: matches[1] }
}

export function isTPItem(item: ItemAttributes): boolean {
  return item.urn_suffix !== null
}
