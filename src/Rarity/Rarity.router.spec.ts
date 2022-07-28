import supertest from 'supertest'
import { buildURL } from '../../spec/utils'
import { collectionAPI } from '../ethereum/api/collection'
import { RarityFragment } from '../ethereum/api/fragments'
import { app } from '../server'
import { Currency } from './types'
import { getRarityFromBlockchain } from './utils'

jest.mock('../ethereum/api/collection')
jest.mock('./utils')

const mockCollectionAPI = collectionAPI as jest.Mocked<typeof collectionAPI>
const mockGetRarityFromBlockchain = getRarityFromBlockchain as jest.MockedFunction<
  typeof getRarityFromBlockchain
>

const server = supertest(app.getApp())

const priceUsd = '10000000000000000000'
const priceMana = '4000000000000000000'

let rarities: RarityFragment[]

beforeEach(() => {
  jest.clearAllMocks()

  rarities = [
    {
      id: 'common',
      name: 'common',
      price: priceUsd,
      maxSupply: '100000',
    },
    {
      id: 'epic',
      name: 'epic',
      price: priceUsd,
      maxSupply: '1000',
    },
    {
      id: 'legendary',
      name: 'legendary',
      price: priceUsd,
      maxSupply: '100',
    },
    {
      id: 'mythic',
      name: 'mythic',
      price: priceUsd,
      maxSupply: '10',
    },
    {
      id: 'rare',
      name: 'rare',
      price: priceUsd,
      maxSupply: '5000',
    },
    {
      id: 'uncommon',
      name: 'uncommon',
      price: priceUsd,
      maxSupply: '10000',
    },
    {
      id: 'unique',
      name: 'unique',
      price: priceUsd,
      maxSupply: '1',
    },
  ]

  mockCollectionAPI.fetchRarities.mockResolvedValueOnce(rarities)
})

describe('when fetching all rarities', () => {
  describe('when get rarity from blockchain function returns data for all rarities', () => {
    beforeEach(() => {
      for (const r of rarities) {
        mockGetRarityFromBlockchain.mockResolvedValueOnce({
          ...r,
          price: priceMana,
        })
      }
    })

    it('should return a list of rarities with the price converted to MANA from USD', async () => {
      const { body } = await server.get(buildURL('/rarities')).expect(200)

      expect(body).toEqual({
        ok: true,
        data: rarities.map((r) => ({
          ...r,
          prices: {
            [Currency.MANA]: priceMana,
            [Currency.USD]: priceUsd,
          },
        })),
      })
    })
  })

  describe('when get rarity from blockchain function fails', () => {
    beforeEach(() => {
      mockGetRarityFromBlockchain.mockRejectedValue(
        new Error('Atahualpa Yupanqui')
      )
    })

    it('should fail with a could not fetch from blockchain error', async () => {
      const { body } = await server.get(buildURL('/rarities')).expect(404)

      expect(body).toEqual({
        ok: false,
        error: 'Could not fetch rarity from blockchain',
        data: {
          name: 'common',
        },
      })
    })
  })
})

describe('when fetching a single rarity by name', () => {
  describe('when get rarity from blockchain function returns data for the provided rarity', () => {
    beforeEach(() => {
      mockGetRarityFromBlockchain.mockResolvedValueOnce({
        ...rarities[0],
        price: priceMana,
      })
    })

    it('should return the rarity with its price converted from USD to MANA', async () => {
      const { body } = await server
        .get(buildURL('/rarities/common'))
        .expect(200)

      expect(body).toEqual({
        ok: true,
        data: {
          ...rarities[0],
          prices: {
            [Currency.MANA]: priceMana,
            [Currency.USD]: priceUsd,
          },
        },
      })
    })
  })

  describe('when get rarity from blockchain function does not return data for the provided rarity', () => {
    it('should fail with an error saying that the rarity could not be found', async () => {
      const { body } = await server
        .get(buildURL('/rarities/invalid'))
        .expect(404)

      expect(body).toEqual({
        ok: false,
        error: 'Rarity not found',
        data: {
          name: 'invalid',
        },
      })
    })
  })
})
