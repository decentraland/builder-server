import { server } from 'decentraland-server'
import { Request } from 'express'
import { Router } from '../common/Router'
import { collectionAPI } from '../ethereum/api/collection'
import { ContractName, getContract } from 'decentraland-transactions'
import { env } from 'decentraland-commons'
import { getMappedChainIdForCurrentChainName } from '../ethereum/utils'
import { ethers } from 'ethers'
import { RarityFragment } from '../ethereum/api/fragments'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'

const maticRpcUrl = env.get<string>('MATIC_RPC_URL')

export class RarityRouter extends Router {
  mount() {
    /**
     * Returns the available rarities
     */
    this.router.get('/rarities', server.handleRequest(this.getRarities))
    this.router.get('/rarities/:name', server.handleRequest(this.getRarity))
  }

  getRarities = async (req: Request) => {
    const inMana = req.query.inMana === 'true'

    const rarities = await collectionAPI.fetchRarities()

    if (inMana) {
      const blockchainRarities = await Promise.all(
        rarities.map((r) => this.getRarityFromBlockchain(r.id))
      )

      const blockchainRaritiesMap = new Map(
        blockchainRarities.map((r) => [r.id, r])
      )

      return rarities.map((r) => ({
        ...r,
        price: blockchainRaritiesMap.get(r.id)!.price,
      }))
    }

    return rarities
  }

  getRarity = async (req: Request): Promise<RarityFragment> => {
    const name = req.params.name
    const inMana = req.query.inMana === 'true'

    if (inMana) {
      return this.getRarityFromBlockchain(name)
    }

    const rarities = await collectionAPI.fetchRarities()

    const rarity = rarities.find((r) => r.id === name)

    if (!rarity) {
      throw new HTTPError('Rarity not found', { name }, STATUS_CODES.notFound)
    }

    return rarity
  }

  private getRarityFromBlockchain = async (
    name: string
  ): Promise<RarityFragment> => {
    const chainId = getMappedChainIdForCurrentChainName()

    const raritiesWithOracle = getContract(
      ContractName.RaritiesWithOracle,
      chainId
    )

    const provider = new ethers.providers.JsonRpcProvider(maticRpcUrl)

    const contract = new ethers.Contract(
      raritiesWithOracle.address,
      raritiesWithOracle.abi,
      provider
    )

    let rarity: any

    try {
      rarity = await contract.getRarityByName(name)
    } catch (e) {
      throw new HTTPError('Rarity not found', { name }, STATUS_CODES.notFound)
    }

    return {
      id: rarity.name,
      name: rarity.name,
      price: rarity.price.toString(),
      maxSupply: rarity.maxSupply.toString(),
    }
  }
}
