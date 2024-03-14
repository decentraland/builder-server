import supertest from 'supertest'
import { STATUS_CODES } from '../common/HTTPError'
import { app } from '../server'
import { NFTService } from './NFT.service'
import { NFT } from './NFT.types'
import { getMockNFT } from './utils'

jest.mock('./NFT.service')

const mockNFTService = NFTService as jest.MockedClass<typeof NFTService>

const server = supertest(app.getApp())

const mockAddress = '0x6D7227d6F36FC997D53B4646132b3B55D751cc7c'

describe('when getting nfts', () => {
  describe('when owner query param does not have a valid ethereum address pattern', () => {
    it('should fail with a bad request error', async () => {
      const response = await server
        .get('/v1/nfts?owner=invalid-owner')
        .expect(STATUS_CODES.badRequest)

      expect(response.body).toEqual({
        data: {
          dataPath: '/owner',
        },
        error: 'must match pattern "^0x[a-fA-F0-9]{40}$"',
        ok: false,
      })
    })
  })

  describe('when first query param is 0', () => {
    it('should fail with a bad request error', async () => {
      const response = await server
        .get('/v1/nfts?first=0')
        .expect(STATUS_CODES.badRequest)

      expect(response.body).toEqual({
        data: {
          dataPath: '/first',
        },
        error: 'must be >= 1',
        ok: false,
      })
    })
  })

  describe('when first query param is -1', () => {
    it('should fail with a bad request error', async () => {
      const response = await server
        .get('/v1/nfts?first=-1')
        .expect(STATUS_CODES.badRequest)

      expect(response.body).toEqual({
        data: {
          dataPath: '/first',
        },
        error: 'must be >= 1',
        ok: false,
      })
    })
  })

  describe('when first query param is not a number', () => {
    it('should fail with a bad request error', async () => {
      const response = await server
        .get('/v1/nfts?first=asd')
        .expect(STATUS_CODES.badRequest)

      expect(response.body).toEqual({
        data: {
          dataPath: '/first',
        },
        error: 'must be number',
        ok: false,
      })
    })
  })

  describe('when skip query param present but first is not', () => {
    it('should fail with a bad request error', async () => {
      const response = await server
        .get('/v1/nfts?skip=-1')
        .expect(STATUS_CODES.badRequest)

      expect(response.body).toEqual({
        data: {
          dataPath: '',
        },
        error: 'must have property first when property skip is present',
        ok: false,
      })
    })
  })

  describe('when skip query param is -1', () => {
    it('should fail with a bad request error', async () => {
      const response = await server
        .get('/v1/nfts?first=1&skip=-1')
        .expect(STATUS_CODES.badRequest)

      expect(response.body).toEqual({
        data: {
          dataPath: '/skip',
        },
        error: 'must be >= 0',
        ok: false,
      })
    })
  })

  describe('when skip query param is not a number', () => {
    it('should fail with a bad request error', async () => {
      const response = await server
        .get('/v1/nfts?first=1&skip=asd')
        .expect(STATUS_CODES.badRequest)

      expect(response.body).toEqual({
        data: {
          dataPath: '/skip',
        },
        error: 'must be number',
        ok: false,
      })
    })
  })

  describe('when the nft service rejects', () => {
    it('should fail with a server error', async () => {
      mockNFTService.prototype.getNFTs.mockRejectedValueOnce('Rejected!')

      const response = await server
        .get(`/v1/nfts?owner=${mockAddress}`)
        .expect(STATUS_CODES.error)

      expect(response.body).toEqual({
        data: {},
        error: 'Failed to fetch NFTs from external sources',
        ok: false,
      })
    })
  })

  it('should return a list of nfts with next and previous cursor data', async () => {
    mockNFTService.prototype.getNFTs.mockResolvedValueOnce({
      next: 'next',
      previous: 'previous',
      nfts: [],
    })

    const response = await server
      .get(`/v1/nfts?owner=${mockAddress}`)
      .expect(STATUS_CODES.ok)

    expect(mockNFTService.prototype.getNFTs).toHaveBeenCalledWith({
      owner: mockAddress,
    })

    expect(response.body).toEqual({
      data: {
        next: 'next',
        nfts: [],
        previous: 'previous',
      },
      ok: true,
    })
  })

  describe('when all query params are provided', () => {
    it('should call the nft service with them', async () => {
      mockNFTService.prototype.getNFTs.mockResolvedValueOnce({
        next: 'next',
        previous: 'previous',
        nfts: [],
      })

      await server
        .get(`/v1/nfts?owner=${mockAddress}&first=10&skip=10&cursor=cursor`)
        .expect(STATUS_CODES.ok)

      expect(mockNFTService.prototype.getNFTs).toHaveBeenCalledWith({
        cursor: 'cursor',
        first: 10,
        owner: mockAddress,
        skip: 10,
      })
    })
  })
})

describe('when getting a single nft', () => {
  describe('when contractAddress path param does not have a valid ethereum address pattern', () => {
    it('should fail with a bad request error', async () => {
      const response = await server
        .get('/v1/nfts/asd/123')
        .expect(STATUS_CODES.badRequest)

      expect(response.body).toEqual({
        data: {
          dataPath: '/contractAddress',
        },
        error: 'must match pattern "^0x[a-fA-F0-9]{40}$"',
        ok: false,
      })
    })
  })

  describe('when the nft service rejects', () => {
    it('should fail with a server error', async () => {
      mockNFTService.prototype.getNFT.mockRejectedValueOnce('Rejected!')

      const response = await server
        .get(`/v1/nfts/${mockAddress}/123`)
        .expect(STATUS_CODES.error)

      expect(response.body).toEqual({
        data: {
          contractAddress: mockAddress,
          tokenId: '123',
        },
        error: 'Failed to fetch NFT from external sources',
        ok: false,
      })
    })
  })

  describe('when the nft service resolves undefined', () => {
    it('should fail with a not found error', async () => {
      mockNFTService.prototype.getNFT.mockResolvedValueOnce(undefined)

      const response = await server
        .get(`/v1/nfts/${mockAddress}/123`)
        .expect(STATUS_CODES.notFound)

      expect(mockNFTService.prototype.getNFT).toHaveBeenCalledWith({
        contractAddress: mockAddress,
        tokenId: '123',
      })

      expect(response.body).toEqual({
        data: {
          contractAddress: mockAddress,
          tokenId: '123',
        },
        error: 'NFT not found',
        ok: false,
      })
    })
  })

  it('should return an nft', async () => {
    const nft: NFT = getMockNFT({
      identifier: '8166776806102523123120990578362437074920',
      collection: 'decentraland',
      contract: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
      token_standard: 'erc721',
      name: 'metropolis',
      description: null,
      image_url:
        'https://api.decentraland.org/v1/parcels/23/-24/map.png?size=24&width=1024&height=1024',
      metadata_url:
        'https://api.decentraland.org/v2/contracts/0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d/tokens/8166776806102523123120990578362437074920',
      opensea_url:
        'https://opensea.io/assets/ethereum/0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d/8166776806102523123120990578362437074920',
      updated_at: '2021-03-20T19:08:07.308381',
      is_disabled: false,
      is_nsfw: false,
      animation_url: null,
      is_suspicious: false,
      creator: '0x52e4e32428c123a1f83da9839f139734a5a5b2b9',
      traits: [
        {
          trait_type: 'Type',
          display_type: null,
          max_value: null,
          value: 'Land',
        },
        {
          trait_type: 'Distance to Road',
          display_type: 'number',
          max_value: null,
          value: 0,
        },
        { trait_type: 'X', display_type: 'number', max_value: null, value: 23 },
        {
          trait_type: 'Y',
          display_type: 'number',
          max_value: null,
          value: -24,
        },
      ],
      owners: [
        { address: '0x87956abc4078a0cc3b89b419928b857b8af826ed', quantity: 1 },
      ],
      rarity: null,
    })

    mockNFTService.prototype.getNFT.mockResolvedValueOnce(nft)

    const response = await server
      .get(`/v1/nfts/${mockAddress}/123`)
      .expect(STATUS_CODES.ok)

    expect(mockNFTService.prototype.getNFT).toHaveBeenCalledWith({
      contractAddress: mockAddress,
      tokenId: '123',
    })

    expect(response.body).toEqual({
      data: nft,
      ok: true,
    })
  })
})
