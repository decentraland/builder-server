import {
  CollectionAttributes,
  FullCollection,
  ThirdPartyCollectionAttributes,
} from '../Collection/Collection.types'
import { matchers } from '../common/matchers'
import { getCurrentNetworkURNProtocol } from '../ethereum/utils'
import { ItemAttributes } from '../Item/Item.types'

const tpItemURNRegex = new RegExp(
  `^(${matchers.baseURN}:${matchers.tpIdentifier}):(${matchers.urnSlot}):(${matchers.urnSlot})$`
)

export const tpCollectionURNRegex = new RegExp(
  `^(${matchers.baseURN}:${matchers.tpIdentifier}):(${matchers.urnSlot})$`
)

export function getDecentralandItemURN(
  item: ItemAttributes,
  collectionAddress: string
): string {
  return `${getDecentralandCollectionURN(collectionAddress)}:${
    item.blockchain_item_id
  }`
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
    throw new Error('The given item URN is not TP compliant')
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

export function getDecentralandCollectionURN(
  collectionAddress: string
): string {
  return `urn:decentraland:${getCurrentNetworkURNProtocol()}:collections-v2:${collectionAddress}`
}

export function getThirdPartyCollectionURN(
  third_party_id: string,
  urn_suffix: string
) {
  return `${third_party_id}:${urn_suffix}`
}

export function isTPCollection(
  collection: CollectionAttributes
): collection is ThirdPartyCollectionAttributes {
  return !!collection.third_party_id && !!collection.urn_suffix
}

/**
 * Checks if an URN belongs to a Decentraland Collection or to a
 * Third Party Collection.
 *
 * @param urn - The URN to be checked.
 */
export function hasTPCollectionURN(collection: FullCollection) {
  return collection.urn && tpCollectionURNRegex.test(collection.urn)
}

/**
 * Decodes or transform a TPC URN into an object with the relevant
 * properties that can be extracted from it..
 *
 * @param urn - The URN to be decoded.
 */
export function decodeTPCollectionURN(
  urn: string
): { third_party_id: string; network: string; urn_suffix: string } {
  const matches = tpCollectionURNRegex.exec(urn)
  if (matches === null) {
    throw new Error('The given collection URN is not Third Party compliant')
  }

  return {
    third_party_id: matches[1],
    network: matches[2],
    urn_suffix: matches[3],
  }
}
