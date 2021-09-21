import { Collection, CollectionAttributes } from '.'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { CollectionFragment } from '../ethereum/api/fragments'

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
    dbCollection.contract_address
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

export const mergeCollections = (
  db: CollectionAttributes,
  remote: CollectionFragment
) => Bridge.mergeCollection(db, remote)
