import { server } from 'decentraland-server'
import { Request } from 'express'
import { Router } from '../common/Router'
import { collectionAPI } from '../ethereum/api/collection'
import { RarityFragment } from '../ethereum/api/fragments'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { isUsingRaritiesWithOracle, getRarityFromBlockchain } from './utils'
import { Currency, Rarity } from './types'

export class RarityRouter extends Router {
  mount() {
    // Returns the available rarities.
    this.router.get('/rarities', server.handleRequest(this.getRarities))

    // Returns a single rarity according to the rarity name provided.
    this.router.get('/rarities/:name', server.handleRequest(this.getRarity))
  }

  getRarities = async (req: Request): Promise<Rarity[]> => {
    const rarities = await collectionAPI.fetchRarities()

    // If the server is still using the old rarities contract.
    // Return rarities as they have been always returned
    if (!isUsingRaritiesWithOracle()) {
      return rarities.map((rarity) => ({ ...rarity, currency: Currency.MANA }))
    }

    const inUSD = req.query.currency === Currency.USD

    // If the prices were requested in USD, just return the data from the graph.
    if (inUSD) {
      return rarities.map((rarity) => ({ ...rarity, currency: Currency.USD }))
    }

    // If not, query the blockchain to obtain the converted rarity prices in MANA
    // from USD.
    const blockchainRarities = await Promise.all(
      rarities.map((rarity) => this.getRarityFromBlockchain(rarity.id))
    )

    const blockchainRaritiesMap = new Map(
      blockchainRarities.map((rarity) => [rarity.id, rarity])
    )

    return rarities.map((rarity) => ({
      ...rarity,
      price: blockchainRaritiesMap.get(rarity.id)!.price,
      currency: Currency.MANA,
    }))
  }

  getRarity = async (req: Request): Promise<Rarity> => {
    if (!isUsingRaritiesWithOracle()) {
      throw new HTTPError(`Cannot GET ${req.path}`, {}, STATUS_CODES.notFound)
    }

    const name = req.params.name

    const inUSD = req.query.currency === Currency.USD

    // If price is requested in USD, get rarities from the graph and return the data as is from
    // the rarity with the given name.
    if (inUSD) {
      const rarities = await collectionAPI.fetchRarities()

      const rarity = rarities.find((r) => r.name === name)

      if (!rarity) {
        throw new HTTPError('Rarity not found', { name }, STATUS_CODES.notFound)
      }

      return { ...rarity, currency: Currency.USD }
    }

    // If not, get the price converted in MANA from the blockchain for that given rarity.
    const rarity = await this.getRarityFromBlockchain(name)

    return { ...rarity, currency: Currency.MANA }
  }

  private getRarityFromBlockchain = async (
    name: string
  ): Promise<RarityFragment> => {
    let rarity: any

    try {
      rarity = await getRarityFromBlockchain(name)
    } catch (e) {
      throw new HTTPError(
        'Could not fetch rarity from blockchain',
        { name },
        STATUS_CODES.notFound
      )
    }

    return {
      id: rarity.name,
      name: rarity.name,
      price: rarity.price.toString(),
      maxSupply: rarity.maxSupply.toString(),
    }
  }
}
