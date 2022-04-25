import { env } from 'decentraland-commons'
import { ChainId, ChainName, getURNProtocol } from '@dcl/schemas'
import { ContractName, getContract } from 'decentraland-transactions'

export const CHAIN_NAME = env.get('CHAIN_NAME') as ChainName

const COLLECTION_FACTORY_VERSION = env.get<string | undefined>(
  'COLLECTION_FACTORY_VERSION'
)

export function getMappedChainIdForCurrentChainName(): ChainId {
  switch (CHAIN_NAME) {
    case ChainName.ETHEREUM_MAINNET:
      return ChainId.MATIC_MAINNET
    case ChainName.ETHEREUM_ROPSTEN:
      return ChainId.MATIC_MUMBAI
    default:
      throw new Error(
        `The chain name ${CHAIN_NAME} doesn't have a chain id to map to`
      )
  }
}

export function getCurrentNetworkURNProtocol(): string {
  return getURNProtocol(getMappedChainIdForCurrentChainName())
}

export function getFactoryCollectionAddress() {
  const contractName =
    COLLECTION_FACTORY_VERSION === '3'
      ? ContractName.CollectionFactoryV3
      : ContractName.CollectionFactory

  const chainId = getMappedChainIdForCurrentChainName()
  const contract = getContract(contractName, chainId)

  return contract.address
}

export function getFactoryCollectionCodeHash() {
  return COLLECTION_FACTORY_VERSION === '3'
    ? '0x7917e9ddbe5e0fd8de84efee3e8089ca7878af7a6aa1a62b4d0b6160821d4de8'
    : '0xf80db993258f789573529f80d215588a9b5973d1dcea7663d5822392fb7fd667'
}

export function getForwarderAddress() {
  const chainId = getMappedChainIdForCurrentChainName()
  const contract = getContract(ContractName.Forwarder, chainId)

  return contract.address
}
