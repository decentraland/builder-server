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

  getRarities = async (): Promise<Rarity[]> => {
    const graphRarities = await collectionAPI.fetchRarities()

    // If the server is still using the old rarities contract,
    // return rarities as they have been always returned.
    if (!isUsingRaritiesWithOracle()) {
      return graphRarities
    }

    // Query the blockchain to obtain rarities with MANA prices converted from USD.
    const blockchainRarities = await Promise.all(
      graphRarities.map((rarity) => this.getRarityFromBlockchain(rarity.id))
    )

    // Convert the array into a Map for an easier lookup
    const blockchainRaritiesMap = new Map(
      blockchainRarities.map((rarity) => [rarity.name, rarity])
    )

    // Consolidate rarities obtained from the graph with rarities obtained
    // from the blockchain.
    return graphRarities.map((graphRarity) => {
      // Not handling if the blockchain rarity is not present because that is checked when calling the
      // this.getRarityFromBlockchain function.
      const blockchainRarity = blockchainRaritiesMap.get(graphRarity.name)!

      return {
        ...graphRarity,
        prices: {
          [Currency.MANA]: blockchainRarity.price,
          [Currency.USD]: graphRarity.price,
        },
      }
    })
  }

  getRarity = async (req: Request): Promise<Rarity> => {
    if (!isUsingRaritiesWithOracle()) {
      throw new HTTPError(`Cannot GET ${req.path}`, {}, STATUS_CODES.notFound)
    }

    const name = req.params.name

    const rarities = await collectionAPI.fetchRarities()

    const graphRarity = rarities.find((r) => r.name === name)

    if (!graphRarity) {
      throw new HTTPError('Rarity not found', { name }, STATUS_CODES.notFound)
    }

    const blockchainRarity = await this.getRarityFromBlockchain(name)

    return {
      ...graphRarity,
      prices: {
        [Currency.MANA]: blockchainRarity.price,
        [Currency.USD]: graphRarity.price,
      },
    }
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
