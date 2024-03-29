import { ContractName, getContract } from 'decentraland-transactions'
import { ethers } from 'ethers'
import { getMappedChainIdForCurrentChainName } from '../ethereum/utils'
import { getRpcUrl } from '../utils/eth'

export function getRarityFromBlockchain(
  name: string
): Promise<{ name: string; price: string; maxSupply: string }> {
  const chainId = getMappedChainIdForCurrentChainName()

  const raritiesWithOracle = getContract(
    ContractName.RaritiesWithOracle,
    chainId
  )

  const provider = new ethers.providers.JsonRpcProvider(getRpcUrl())

  const contract = new ethers.Contract(
    raritiesWithOracle.address,
    raritiesWithOracle.abi,
    provider
  )

  return contract.getRarityByName(name)
}
