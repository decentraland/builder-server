import { env } from 'decentraland-commons'
import { ChainId, ChainName, getURNProtocol } from '@dcl/schemas'
import { ContractName, getContract } from 'decentraland-transactions'

function getChainName() {
  return env.get('CHAIN_NAME') as ChainName
}

function getCollectionFactoryVersion() {
  return env.get<string | undefined>('COLLECTION_FACTORY_VERSION')
}

export function getMappedChainIdForCurrentChainName():
  | ChainId.MATIC_MAINNET
  | ChainId.MATIC_MUMBAI {
  const chainName = getChainName()

  switch (chainName) {
    case ChainName.ETHEREUM_MAINNET:
      return ChainId.MATIC_MAINNET
    case ChainName.ETHEREUM_ROPSTEN:
      return ChainId.MATIC_MUMBAI
    default:
      throw new Error(
        `The chain name ${chainName} doesn't have a chain id to map to`
      )
  }
}

export function getCurrentNetworkURNProtocol(): string {
  return getURNProtocol(getMappedChainIdForCurrentChainName())
}

export function getFactoryCollectionAddress() {
  const contractName =
    getCollectionFactoryVersion() === '3'
      ? ContractName.CollectionFactoryV3
      : ContractName.CollectionFactory

  const chainId = getMappedChainIdForCurrentChainName()
  const contract = getContract(contractName, chainId)

  return contract.address
}

export function getFactoryCollectionCodeHash() {
  const v3CodeHashes = {
    [ChainId.MATIC_MAINNET]:
      '0x5a1d707e8f0be7be88213a8216231468689b96dcd4abed0931276f4886a87beb',
    [ChainId.MATIC_MUMBAI]:
      '0x7917e9ddbe5e0fd8de84efee3e8089ca7878af7a6aa1a62b4d0b6160821d4de8',
  }

  const v2CodeHashes = {
    [ChainId.MATIC_MAINNET]:
      '0x4b1f8521034f9cc96eb813b6209f732f73b24abd7673e0ad5aac8c8c46b5ad9c',
    [ChainId.MATIC_MUMBAI]:
      '0xf80db993258f789573529f80d215588a9b5973d1dcea7663d5822392fb7fd667',
  }

  const chainId = getMappedChainIdForCurrentChainName()

  return getCollectionFactoryVersion() === '3'
    ? v3CodeHashes[chainId]
    : v2CodeHashes[chainId]
}

export function getForwarderAddress() {
  const chainId = getMappedChainIdForCurrentChainName()
  const contract = getContract(ContractName.Forwarder, chainId)

  return contract.address
}
