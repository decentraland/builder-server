import { getCurrentNetworkURNProtocol } from '../ethereum/utils'
import { CollectionAttributes } from './Collection.types'

export function getDecentralandCollectionURN(
  collection: CollectionAttributes
): string {
  return `urn:decentraland:${getCurrentNetworkURNProtocol()}:collections-v2:${
    collection.contract_address
  }}`
}
