import { utils } from 'decentraland-commons'
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
  return {
    ...utils.omit(dbCollection, ['urn_suffix']),
    urn: getDecentralandCollectionURN(dbCollection.contract_address),
  }
}

export function toDBCollection(
  collection: FullCollection
): CollectionAttributes {
  return {
    ...utils.omit(collection, ['urn']),
    urn_suffix: null,
  }
}
