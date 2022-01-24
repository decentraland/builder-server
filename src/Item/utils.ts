import { utils } from 'decentraland-commons'
import { Collection } from '../Collection'
import { NonExistentCollectionError } from '../Collection/Collection.errors'
import {
  getDecentralandCollectionURN,
  isTPCollection,
} from '../Collection/utils'
import { matchers } from '../common/matchers'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { NonExistentItemError, UnpublishedItemError } from './Item.errors'
import { Item } from './Item.model'
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

export function isTPItemURN(itemURN: string): boolean {
  return tpItemURNRegex.test(itemURN)
}

export async function getMergedItem(id: string): Promise<FullItem> {
  const dbItem = await Item.findOne(id)
  if (!dbItem) {
    throw new NonExistentItemError(id)
  }

  const dbCollection = await Collection.findOne(dbItem.collection_id)
  if (!dbCollection) {
    throw new NonExistentCollectionError(id)
  }

  let fullItem: FullItem

  if (isTPItem(dbItem) && isTPCollection(dbCollection)) {
    const urn = buildTPItemURN(
      dbCollection.third_party_id,
      dbCollection.urn_suffix,
      dbItem.urn_suffix
    )
    const remoteItem = await thirdPartyAPI.fetchItem(urn)

    if (!remoteItem) {
      throw new UnpublishedItemError(id)
    }

    fullItem = Bridge.mergeTPItem(dbItem, remoteItem)
  } else {
    const {
      collection: remoteCollection,
      item: remoteItem,
    } = await collectionAPI.fetchCollectionWithItem(
      dbCollection.contract_address,
      dbItem.blockchain_item_id
    )

    if (!remoteCollection || !remoteItem) {
      throw new UnpublishedItemError(id)
    }

    fullItem = Bridge.mergeItem(dbItem, remoteItem, remoteCollection)
  }

  return fullItem
}
