import { server } from 'decentraland-server'
import { Request } from 'express'
import { Router } from '../common/Router'
import { collectionAPI } from '../ethereum/api/collection'
import { ContractName, getContract } from 'decentraland-transactions'
import { getMappedChainIdForCurrentChainName } from '../ethereum/utils'
import { ethers } from 'ethers'
import { RarityFragment } from '../ethereum/api/fragments'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { isUsingRaritiesWithOracle, getMaticRpcUrl } from './utils'

export class RarityRouter extends Router {
  mount() {
    // Returns the available rarities.
    this.router.get('/rarities', server.handleRequest(this.getRarities))

    if (isUsingRaritiesWithOracle()) {
      // Returns a single rarity according to the rarity name provided.
      this.router.get('/rarities/:name', server.handleRequest(this.getRarity))
    }
  }

  getRarities = async (req: Request) => {
    // If the server is still using the old rarities contract.
    // Return rarities as they have been always returned
    if (!isUsingRaritiesWithOracle()) {
      return collectionAPI.fetchRarities()
    }

    const inUSD = req.query.inUSD === 'true'

    const rarities = await collectionAPI.fetchRarities()

    // If the prices were requested in USD, just return the data from the graph.
    if (inUSD) {
      return rarities
    }

    // If not, query the blockchain to obtain the converted rarity prices in MANA
    // from USD.
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

  getRarity = async (req: Request): Promise<RarityFragment> => {
    const name = req.params.name

    const inUSD = req.query.inUSD === 'true'

    // If price is requested in USD, get rarities from the graph and return the data as is from
    // the rarity with the given name.
    if (inUSD) {
      const rarities = await collectionAPI.fetchRarities()

      const rarity = rarities.find((r) => r.id === name)

      if (!rarity) {
        throw new HTTPError('Rarity not found', { name }, STATUS_CODES.notFound)
      }

      return rarity
    }

    // If not, get the price converted in MANA from the blockchain for that given rarity.
    return this.getRarityFromBlockchain(name)
  }

  private getRarityFromBlockchain = async (
    name: string
  ): Promise<RarityFragment> => {
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
