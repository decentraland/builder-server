import { utils } from 'decentraland-commons'
import { getCurrentNetworkURNProtocol } from '../ethereum/utils'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { matchers } from '../common/matchers'
import { Collection } from './Collection.model'
import {
  CollectionAttributes,
  ThirdPartyCollectionAttributes,
  FullCollection,
} from './Collection.types'
import {
  NonExistentCollectionError,
  UnpublishedCollectionError,
} from './Collection.errors'

export const tpCollectionURNRegex = new RegExp(
  `^(${matchers.baseURN}:${matchers.tpwIdentifier}):(${matchers.urnSlot})$`
)

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
 * Converts a collection retrieved from the DB into a "FullCollection".
 *
 * @param dbCollection - The "FullCollection" to be converted into a DB collection.
 */
export function toFullCollection(
  dbCollection: CollectionAttributes
): FullCollection {
  const { third_party_id, urn_suffix, contract_address } = dbCollection

  return {
    ...utils.omit(dbCollection, ['urn_suffix', 'third_party_id']),
    urn:
      third_party_id && urn_suffix
        ? getThirdPartyCollectionURN(third_party_id, urn_suffix)
        : getDecentralandCollectionURN(contract_address!),
  }
}

/**
 * Converts a "FullCollection" into a collection that can be inserted into the
 * collection's database.
 *
 * @param collection - The "FullCollection" to be converted into a DB collection.
 */
export function toDBCollection(
  collection: FullCollection
): CollectionAttributes {
  const isTPW = hasTPCollectionURN(collection)
  const decodedURN = isTPW
    ? decodeTPCollectionURN(collection.urn!)
    : { urn_suffix: null, third_party_id: null }

  let urn_suffix = decodedURN.urn_suffix
  let third_party_id = decodedURN.third_party_id
  let eth_address = isTPW ? '' : collection.eth_address
  let contract_address = isTPW ? null : collection.contract_address
  let salt = isTPW ? '' : collection.salt

  return {
    ...utils.omit(collection, ['urn', 'lock']),
    urn_suffix,
    eth_address,
    contract_address,
    third_party_id,
    salt,
  }
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

/**
 * Will return a collection formed by merging the collection present in
 * the database and the one found in the graph.
 */
export async function getMergedCollection(
  id: string
): Promise<CollectionAttributes> {
  const dbCollection = await Collection.findOne<CollectionAttributes>(id)

  if (!dbCollection) {
    throw new NonExistentCollectionError(id)
  }

  let mergedCollection: CollectionAttributes

  if (isTPCollection(dbCollection)) {
    const lastItem = await thirdPartyAPI.fetchLastItem(
      dbCollection.third_party_id,
      dbCollection.urn_suffix
    )

    if (!lastItem) {
      throw new UnpublishedCollectionError(id)
    }

    mergedCollection = Bridge.mergeTPCollection(dbCollection, lastItem)
  } else {
    const remoteCollection = await collectionAPI.fetchCollection(
      dbCollection.contract_address!
    )

    if (!remoteCollection) {
      throw new UnpublishedCollectionError(id)
    }

    mergedCollection = Bridge.mergeCollection(dbCollection, remoteCollection)
  }

  return mergedCollection
}
