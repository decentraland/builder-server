import { utils } from 'decentraland-commons'
import { getCurrentNetworkURNProtocol } from '../ethereum/utils'
import { CollectionAttributes, FullCollection } from './Collection.types'

const tpwCollectionURNRegex = /^urn:decentraland:([^:]+):ext-thirdparty:([^:]+)$/

export function getDecentralandCollectionURN(
  collectionAddress: string
): string {
  return `urn:decentraland:${getCurrentNetworkURNProtocol()}:collections-v2:${collectionAddress}`
}

export function getThirdPartyCollectionURN(urn_suffix: string) {
  return `urn:decentraland:${getCurrentNetworkURNProtocol()}:ext-thirdparty:${urn_suffix}`
}

export function toFullCollection(
  dbCollection: CollectionAttributes
): FullCollection {
  return {
    ...utils.omit(dbCollection, ['urn_suffix']),
    urn: dbCollection.urn_suffix
      ? getThirdPartyCollectionURN(dbCollection.urn_suffix)
      : getDecentralandCollectionURN(dbCollection.contract_address),
  }
}

export function toDBCollection(
  collection: FullCollection
): CollectionAttributes {
  const isTPW = isTPCollection(collection.urn)
  let urn_suffix = isTPW ? decodeTPCollectionURN(collection.urn)[1] : null
  let eth_address = isTPW ? '' : collection.eth_address
  let contract_address = isTPW ? '' : collection.contract_address
  let salt = isTPW ? '' : collection.salt

  return {
    ...utils.omit(collection, ['urn', 'lock']),
    urn_suffix,
    eth_address,
    contract_address,
    salt,
  }
}

export function isTPCollection(urn: string) {
  return tpwCollectionURNRegex.test(urn)
}

export function decodeTPCollectionURN(urn: string): [string, string] {
  const matches = tpwCollectionURNRegex.exec(urn)
  if (matches === null) {
    throw new Error('The given collection URN is not TWP compliant')
  }

  return [matches[1], matches[2]]
}
