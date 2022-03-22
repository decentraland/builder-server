import { env } from 'decentraland-commons'
import { ChainId, getURNProtocol } from '@dcl/schemas'
import { Network } from './types'

const network = env.get('ETHEREUM_NETWORK') as Network

export function getChainIdFromNetwork(network: Network): ChainId {
  switch (network) {
    case Network.MAINNET:
      return ChainId.MATIC_MAINNET
    case Network.ROPSTEN:
      return ChainId.MATIC_MUMBAI
    default:
      throw new Error(
        `The network ${network} doesn't have a chain id to map to`
      )
  }
}

export function getCurrentNetworkURNProtocol(): string {
  return getURNProtocol(getChainIdFromNetwork(network))
}
