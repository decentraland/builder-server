import {
  CollectionAttributes,
  FullCollection,
  ThirdPartyCollectionAttributes,
} from '../Collection/Collection.types'
import { matchers } from '../common/matchers'
import { getCurrentNetworkURNProtocol } from '../ethereum/utils'
import { ItemAttributes } from '../Item/Item.types'

// const tpItemURNRegex = new RegExp(
//   `^(${matchers.baseURN}:${matchers.tpIdentifier}):(${matchers.urnSlot}):(${matchers.urnSlot})$`
// )

// export const tpCollectionURNRegex = new RegExp(
//   `^(${matchers.baseURN}:${matchers.tpIdentifier}):(${matchers.urnSlot})$`
// )

export enum URNProtocol {
  MAINNET = 'mainnet',
  GOERLI = 'goerli',
  SEPOLIA = 'sepolia',
  MATIC = 'matic',
  MUMBAI = 'mumbai',
  AMOY = 'amoy',
  OFF_CHAIN = 'off-chain',
}
export enum LinkedContractProtocol {
  MAINNET = 'mainnet',
  SEPOLIA = 'sepolia',
  MATIC = 'matic',
  AMOY = 'amoy',
}
export enum URNType {
  BASE_AVATARS = 'base-avatars',
  COLLECTIONS_V2 = 'collections-v2',
  COLLECTIONS_THIRDPARTY = 'collections-thirdparty',
  COLLECTIONS_THIRDPARTY_V2 = 'collections-linked-wearables',
  ENTITY = 'entity',
}

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
  const matches = new RegExp(matchers.itemUrn).exec(itemURN)
  if (!matches || !matches.groups) {
    throw new Error('The given item URN is not item compliant')
  }

  const isTpV1 = matches.groups.type === URNType.COLLECTIONS_THIRDPARTY
  const isTpV2 = matches.groups.type === URNType.COLLECTIONS_THIRDPARTY_V2

  if (!isTpV1 && !isTpV2) {
    throw new Error('The given item URN is not Third Party compliant')
  }

  return {
    third_party_id: `urn:decentraland:${matches.groups.protocol}:${
      matches.groups.type
    }:${
      isTpV1
        ? matches.groups.thirdPartyName
        : matches.groups.thirdPartyLinkedCollectionName
    }`,
    network: matches.groups.protocol,
    collection_urn_suffix: isTpV1
      ? matches.groups.thirdPartyCollectionId
      : matches.groups.linkedCollectionNetwork +
        ':' +
        matches.groups.linkedCollectionContractAddress,
    item_urn_suffix: matches.groups.thirdPartyTokenId,
  }
}

export function isTPItemURN(itemURN: string): boolean {
  try {
    decodeThirdPartyItemURN(itemURN)
    return true
  } catch (_) {
    return false
  }
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
export function hasTPCollectionURN(collection: FullCollection): boolean {
  if (!collection.urn) {
    return false
  }

  try {
    decodeTPCollectionURN(collection.urn)
    return true
  } catch (_) {
    return false
  }
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
  const matches = new RegExp(matchers.collectionUrn).exec(urn)
  if (!matches || !matches.groups) {
    throw new Error('The given item URN is not item compliant')
  }

  const isTpV1 = matches.groups.type === URNType.COLLECTIONS_THIRDPARTY
  const isTpV2 = matches.groups.type === URNType.COLLECTIONS_THIRDPARTY_V2

  if (!isTpV1 && !isTpV2) {
    throw new Error('The given item URN is not Third Party compliant')
  }

  return {
    third_party_id: `urn:decentraland:${matches.groups.protocol}:${
      matches.groups.type
    }:${
      isTpV1
        ? matches.groups.thirdPartyName
        : matches.groups.thirdPartyLinkedCollectionName
    }`,
    network: matches.groups.protocol,
    urn_suffix: isTpV1
      ? matches.groups.thirdPartyCollectionId
      : matches.groups.linkedCollectionNetwork +
        ':' +
        matches.groups.linkedCollectionContractAddress,
  }
}
