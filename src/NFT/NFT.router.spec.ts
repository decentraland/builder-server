import supertest from 'supertest'
import { STATUS_CODES } from '../common/HTTPError'
import { app } from '../server'
import { NFTService } from './NFT.service'

jest.mock('./NFT.service')

const mockNFTService = NFTService as jest.MockedClass<typeof NFTService>

const server = supertest(app.getApp())

afterEach(() => {
  jest.clearAllMocks()
})

describe('when getting nfts', () => {
  beforeEach(() => {
    mockNFTService.prototype.getNFTs.mockResolvedValueOnce({
      next: 'next',
      previous: 'previous',
      nfts: [],
    })
  })

  describe('when owner query param does not have a valid etherum address pattern', () => {
    it('should fail with a bad request error', async () => {
      const response = await server
        .get('/v1/nfts?owner=invalid-owner')
        .expect(STATUS_CODES.badRequest)

      expect(response.body).toEqual({
        data: {
          dataPath: '/owner',
        },
        error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
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
        error: 'should be >= 1',
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
        error: 'should be >= 1',
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
        error: 'should be number',
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
        error: 'should have property first when property skip is present',
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
        error: 'should be >= 0',
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
        error: 'should be number',
        ok: false,
      })
    })
  })

  describe('when the nft service rejects', () => {
    it('should faild with a server error', async () => {
      mockNFTService.prototype.getNFTs.mockReset()
      mockNFTService.prototype.getNFTs.mockRejectedValueOnce('Rejected!')

      const response = await server.get('/v1/nfts').expect(STATUS_CODES.error)

      expect(response.body).toEqual({
        data: {},
        error: 'Failed to fetch NFTs from external sources',
        ok: false,
      })
    })
  })

  it('should return a list of nfts with next and previous cursor data', async () => {
    const response = await server.get('/v1/nfts').expect(STATUS_CODES.ok)

    expect(mockNFTService.prototype.getNFTs).toHaveBeenCalledWith({})

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
      await server
        .get(
          '/v1/nfts?owner=0x6D7227d6F36FC997D53B4646132b3B55D751cc7c&first=10&skip=10&cursor=cursor'
        )
        .expect(STATUS_CODES.ok)

      expect(mockNFTService.prototype.getNFTs).toHaveBeenCalledWith({
        cursor: 'cursor',
        first: 10,
        owner: '0x6D7227d6F36FC997D53B4646132b3B55D751cc7c',
        skip: 10,
      })
    })
  })
})
