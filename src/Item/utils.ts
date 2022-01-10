import { utils } from 'decentraland-commons'
import { getDecentralandCollectionURN } from '../Collection/utils'
import { matchers } from '../common/matchers'
import { FullItem, ItemAttributes } from './Item.types'

const tpItemURNRegex = new RegExp(
  `^(${matchers.baseURN}:${matchers.tpwIdentifier}):(${matchers.urnSlot}):(${matchers.urnSlot})$`
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
    urn_suffix: item.urn
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
): item is ItemAttributes & { urn_suffix: string; collection_id: string } {
  return item.urn_suffix !== null && item.collection_id !== null
}

export function decodeThirdPartyItemURN(
  itemURN: string
): {
  third_party_id: string
  network: string
  collection_urn_suffix: string
  item_urn_suffix: string
} {
  const matches = tpItemURNRegex.exec(itemURN)
  if (matches === null) {
    throw new Error('The given item URN is not TPW compliant')
  }

  return {
    third_party_id: matches[1],
    network: matches[2],
    collection_urn_suffix: matches[3],
    item_urn_suffix: matches[4],
  }
}

// TODO: @TPW: implement this
export function getMergedItem(_id: string): Promise<FullItem> {
  return {} as any
}
