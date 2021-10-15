import { utils } from 'decentraland-commons'
import { getCurrentNetworkURNProtocol } from '../ethereum/utils'
import { Collection, CollectionAttributes, FullCollection } from '.'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { CollectionFragment } from '../ethereum/api/fragments'

const tpwCollectionURNRegex = /^urn:decentraland:([^:]+):ext-thirdparty:([^:]+)$/

export function getDecentralandCollectionURN(
  collectionAddress: string
): string {
  return `urn:decentraland:${getCurrentNetworkURNProtocol()}:collections-v2:${collectionAddress}`
}

export function getThirdPartyCollectionURN(urn_suffix: string) {
  return `urn:decentraland:${getCurrentNetworkURNProtocol()}:ext-thirdparty:${urn_suffix}`
}

/**
 * Converts a collection retrieved from the DB into a "FullCollection".
 *
 * @param dbCollection - The "FullCollection" to be converted into a DB collection.
 */
export function toFullCollection(
  dbCollection: CollectionAttributes
): FullCollection {
  return {
    ...utils.omit(dbCollection, ['urn_suffix']),
    urn: dbCollection.urn_suffix
      ? getThirdPartyCollectionURN(dbCollection.urn_suffix)
      : getDecentralandCollectionURN(dbCollection.contract_address!),
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
  const isTPW = isTPCollection(collection.urn)
  let urn_suffix = isTPW
    ? decodeTPCollectionURN(collection.urn).urn_suffix
    : null
  let eth_address = isTPW ? '' : collection.eth_address
  let contract_address = isTPW ? null : collection.contract_address
  let salt = isTPW ? '' : collection.salt

  return {
    ...utils.omit(collection, ['urn', 'lock']),
    urn_suffix,
    eth_address,
    contract_address,
    salt,
  }
}

/**
 * Checks if an URN belongs to a Decentraland Collection or to a
 * Third Party Collection.
 *
 * @param urn - The URN to be checked.
 */
export function isTPCollection(urn: string) {
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
): { network: string; urn_suffix: string } {
  const matches = tpwCollectionURNRegex.exec(urn)
  if (matches === null) {
    throw new Error('The given collection URN is not TWP compliant')
  }

  return { network: matches[1], urn_suffix: matches[2] }
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
  const dbCollection = await getDBCollection(id)

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

export const getDBCollection = (id: string) =>
  Collection.findOne<CollectionAttributes>(id)

export const getRemoteCollection = async (contractAddress: string) =>
  (await collectionAPI.fetchCollection(contractAddress)) || undefined

export const getRemoteCollections = async () =>
  await collectionAPI.fetchCollections()

export const mergeCollections = (
  db: CollectionAttributes,
  remote: CollectionFragment
) => Bridge.mergeCollection(db, remote)
