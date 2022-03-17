import { utils } from 'decentraland-commons'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { ItemCuration } from '../Curation/ItemCuration'
import { CollectionAttributes, FullCollection } from './Collection.types'
import { UnpublishedCollectionError } from './Collection.errors'
import {
  decodeTPCollectionURN,
  getDecentralandCollectionURN,
  getThirdPartyCollectionURN,
  hasTPCollectionURN,
  isTPCollection,
} from '../utils/urn'

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
  const isTP = hasTPCollectionURN(collection)
  const decodedURN = isTP
    ? decodeTPCollectionURN(collection.urn!)
    : { urn_suffix: null, third_party_id: null }

  let urn_suffix = decodedURN.urn_suffix
  let third_party_id = decodedURN.third_party_id
  let eth_address = isTP ? '' : collection.eth_address
  let contract_address = isTP ? null : collection.contract_address
  let salt = isTP ? '' : collection.salt

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
 * Will return a collection by merging the collection present in the database and the remote counterpart.
 * For standard collections, the remote collection will be fetched from thegraph, if it's not present it'll throw.
 * For TP collections, the remote collection is fetched from the Catalyst, if it's not present it'll throw
 */
export async function getMergedCollection(
  dbCollection: CollectionAttributes
): Promise<CollectionAttributes> {
  let mergedCollection: CollectionAttributes

  if (isTPCollection(dbCollection)) {
    const lastItemCuration = await ItemCuration.findLastByCollectionId(
      dbCollection.id
    )

    if (!lastItemCuration) {
      throw new UnpublishedCollectionError(dbCollection.id)
    }

    mergedCollection = Bridge.mergeTPCollection(dbCollection, lastItemCuration)
  } else {
    const remoteCollection = await collectionAPI.fetchCollection(
      dbCollection.contract_address!
    )

    if (!remoteCollection) {
      throw new UnpublishedCollectionError(dbCollection.id)
    }

    mergedCollection = Bridge.mergeCollection(dbCollection, remoteCollection)
  }

  return mergedCollection
}
