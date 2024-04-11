import { env } from 'decentraland-commons'
import { ChainId, ChainName, getURNProtocol } from '@dcl/schemas'
import { ContractName, getContract } from 'decentraland-transactions'

export function getChainName() {
  return env.get('CHAIN_NAME') as ChainName
}

export function getMappedChainIdForCurrentChainName():
  | ChainId.MATIC_MAINNET
  | ChainId.MATIC_AMOY {
  const chainName = getChainName()

  switch (chainName) {
    case ChainName.ETHEREUM_MAINNET:
      return ChainId.MATIC_MAINNET
    case ChainName.ETHEREUM_GOERLI:
    case ChainName.ETHEREUM_SEPOLIA:
      return ChainId.MATIC_AMOY
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
  const contractName = ContractName.CollectionFactoryV3
  const chainId = getMappedChainIdForCurrentChainName()
  const contract = getContract(contractName, chainId)

  return contract.address
}

export function getFactoryCollectionCodeHash() {
  const codeHashes = {
    [ChainId.MATIC_MAINNET]:
      '0x5a1d707e8f0be7be88213a8216231468689b96dcd4abed0931276f4886a87beb',
    [ChainId.MATIC_MUMBAI]:
      '0x7917e9ddbe5e0fd8de84efee3e8089ca7878af7a6aa1a62b4d0b6160821d4de8',
    [ChainId.MATIC_AMOY]:
      '0xc5bd2e95bc8bf4499c511b9b40aef6298cda5a6d154869db199c160e29672930'
  }

  const chainId = getMappedChainIdForCurrentChainName()

  return codeHashes[chainId]
}

export function getForwarderAddress() {
  const chainId = getMappedChainIdForCurrentChainName()
  const contract = getContract(ContractName.Forwarder, chainId)

  return contract.address
}
