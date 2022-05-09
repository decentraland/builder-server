import supertest from 'supertest'
import { buildURL } from '../../spec/utils'
import { collectionAPI } from '../ethereum/api/collection'
import { RarityFragment } from '../ethereum/api/fragments'
import { app } from '../server'
import { Currency } from './types'
import { getRarityFromBlockchain, isUsingRaritiesWithOracle } from './utils'

jest.mock('../ethereum/api/collection')
jest.mock('./utils')

const mockCollectionAPI = collectionAPI as jest.Mocked<typeof collectionAPI>
const mockIsUsingRaritiesWithOracle = isUsingRaritiesWithOracle as jest.MockedFunction<
  typeof isUsingRaritiesWithOracle
>
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
  describe('when rarities with oracle feature flag is disabled', () => {
    beforeEach(() => {
      mockIsUsingRaritiesWithOracle.mockReturnValueOnce(false)
    })

    it('should return a list of rarities obtained from the collectionAPI', async () => {
      const { body } = await server.get(buildURL('/rarities')).expect(200)

      expect(body).toEqual({
        ok: true,
        data: rarities,
      })
    })
  })

  describe('when rarities with oracle feature flag is enabled', () => {
    beforeEach(() => {
      mockIsUsingRaritiesWithOracle.mockReturnValueOnce(true)
    })

    it('should return a list of rarities with the price converted to MANA from USD', async () => {
      for (const r of rarities) {
        mockGetRarityFromBlockchain.mockResolvedValueOnce({
          ...r,
          price: priceMana,
        })
      }

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

    describe('when fetching a rarity from the blockchain fails', () => {
      it('should fail with a could not fetch from blockchain error', async () => {
        mockGetRarityFromBlockchain.mockImplementation(() =>
          Promise.reject(new Error('Atahualpa Yupanqui'))
        )

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
})

describe('when fetching a single rarity by name', () => {
  describe('when rarities with oracle feature flag is disabled', () => {
    beforeEach(() => {
      mockIsUsingRaritiesWithOracle.mockReturnValueOnce(false)
    })

    it('should fail with an endpoint not found', async () => {
      const { body } = await server
        .get(buildURL('/rarities/common'))
        .expect(404)

      expect(body).toEqual({
        data: {},
        error: 'Cannot GET /rarities/common',
        ok: false,
      })
    })
  })

  describe('when rarities with oracle feature flag is enabled', () => {
    beforeEach(() => {
      mockIsUsingRaritiesWithOracle.mockReturnValueOnce(true)
    })

    it('should return the rarity with its price converted from USD to MANA', async () => {
      mockGetRarityFromBlockchain.mockResolvedValueOnce({
        ...rarities[0],
        price: priceMana,
      })

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

    describe('when the name provided is invalid', () => {
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
})
