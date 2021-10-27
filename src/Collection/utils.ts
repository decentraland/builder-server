import { utils } from 'decentraland-commons'
import { getCurrentNetworkURNProtocol } from '../ethereum/utils'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { CollectionFragment } from '../ethereum/api/fragments'
import { matchers } from '../common/matchers'
import { Collection } from './Collection.model'
import { CollectionAttributes, FullCollection } from './Collection.types'

export const tpwCollectionURNRegex = new RegExp(
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
  return `urn:decentraland:${getCurrentNetworkURNProtocol()}:collections-thirdparty:${third_party_id}:${urn_suffix}`
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
  const isTPW = isTPCollectionURN(collection.urn)
  const decodedURN = isTPW
    ? decodeTPCollectionURN(collection.urn)
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
export function isTPCollectionURN(urn: string) {
  return tpwCollectionURNRegex.test(urn)
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
  const matches = tpwCollectionURNRegex.exec(urn)
  if (matches === null) {
    throw new Error('The given collection URN is not TWP compliant')
  }

  return {
    third_party_id: matches[1],
    network: matches[2],
    urn_suffix: matches[3],
  }
}

type GetMergedCollectionResult =
  | { status: 'not_found'; collection: undefined }
  | { status: 'incomplete' | 'complete'; collection: CollectionAttributes }

/**
 * Will return a collection formed by merging the collection present in
 * the database and the one found in the graph.
 *
 * The result will depend according to the availability of those collections.
 *
 * When the collection does not exist on the database:
 * status = not_found
 *
 * When the collection does not exist on the graph:
 * status = incomplete & collection = database collection
 *
 * When both collections are available:
 * status = complete & collection = merged db and graph collection
 */
export const getMergedCollection = async (
  id: string
): Promise<GetMergedCollectionResult> => {
  const dbCollection = await Collection.findOne<CollectionAttributes>(id)

  if (!dbCollection) {
    return {
      status: 'not_found',
      collection: undefined,
    }
  }

  const remoteCollection = await getRemoteCollection(
    dbCollection.contract_address!
  )

  if (!remoteCollection) {
    return {
      status: 'incomplete',
      collection: dbCollection,
    }
  }

  const mergedCollection = mergeCollections(dbCollection, remoteCollection)

  return {
    status: 'complete',
    collection: mergedCollection,
  }
}

export const getRemoteCollection = async (contractAddress: string) =>
  (await collectionAPI.fetchCollection(contractAddress)) || undefined

export const getRemoteCollections = async () =>
  await collectionAPI.fetchCollections()

export const mergeCollections = (
  db: CollectionAttributes,
  remote: CollectionFragment
) => Bridge.mergeCollection(db, remote)
