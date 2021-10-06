import { getCurrentNetworkURNProtocol } from '../ethereum/utils'
import { CollectionAttributes, FullCollection } from './Collection.types'

export function getDecentralandCollectionURN(
  collectionAddress: string
): string {
  return `urn:decentraland:${getCurrentNetworkURNProtocol()}:collections-v2:${collectionAddress}`
}

export function toFullCollection(
  dbCollection: CollectionAttributes
): FullCollection {
  const fullCollection: FullCollection = {
    ...dbCollection,
    urn: getDecentralandCollectionURN(dbCollection.contract_address),
  }
  delete (fullCollection as FullCollection & { urn_suffix: unknown }).urn_suffix

  return fullCollection
}

export function toDBCollection(
  collection: FullCollection
): CollectionAttributes {
  const attributes = {
    ...collection,
    urn_suffix: null,
  }
  // Removes the DCL collection URN and sets the urn_suffix to null
  delete (attributes as CollectionAttributes & { urn: unknown }).urn
  return attributes
}
