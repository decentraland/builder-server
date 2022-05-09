import { env } from 'decentraland-commons'
import { ContractName, getContract } from 'decentraland-transactions'
import { ethers } from 'ethers'
import { getMappedChainIdForCurrentChainName } from '../ethereum/utils'

export function isUsingRaritiesWithOracle(): boolean {
  return env.get<string | undefined>('FF_RARITIES_WITH_ORACLE') === '1'
}

export function getRarityFromBlockchain(
  name: string
): Promise<{ name: string; price: string; maxSupply: string }> {
  const chainId = getMappedChainIdForCurrentChainName()

  const raritiesWithOracle = getContract(
    ContractName.RaritiesWithOracle,
    chainId
  )

  const provider = new ethers.providers.JsonRpcProvider(getMaticRpcUrl())

  const contract = new ethers.Contract(
    raritiesWithOracle.address,
    raritiesWithOracle.abi,
    provider
  )

  return contract.getRarityByName(name)
}

function getMaticRpcUrl(): string {
  const maticRpcUrl = env.get<string | undefined>('MATIC_RPC_URL')

  if (!maticRpcUrl) {
    throw new Error('MATIC_RPC_URL not defined')
  }

  return maticRpcUrl
}
