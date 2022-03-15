import { env } from 'decentraland-commons'
import fetch, { Response } from 'node-fetch'
import { NFTService } from './NFT.service'

jest.mock('node-fetch')
jest.mock('decentraland-commons')

const mockFetch = fetch as jest.MockedFunction<typeof fetch>
const mockEnv = env as jest.Mocked<typeof env>

const mockUrl = 'https://some-url.com/v1'
const mockApiKey = 'https://some-url.com/v1'

beforeEach(() => {
  mockEnv.get.mockReturnValueOnce(mockUrl)
  mockEnv.get.mockReturnValueOnce(mockApiKey)

  jest.clearAllMocks()
})

describe('when getting a list of nfts', () => {
  let service: NFTService
  let requestInit: RequestInit

  beforeEach(() => {
    service = new NFTService()
    requestInit = {
      headers: {
        Accept: 'application/json',
        'X-API-KEY': mockApiKey,
      },
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          next: 'next',
          previous: 'previous',
          assets: [
            {
              asset_contract: {
                name: 'name',
                address: 'address',
              },
              token_id: 'token_id',
              name: 'name',
              image_thumbnail_url: 'image_thumbnail_url',
            },
          ],
        }),
    } as Response)
  })

  describe('when owner is provided', () => {
    it('should make a request with the owner query param', async () => {
      await service.getNFTs({ owner: 'owner' })

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockUrl}/assets?owner=owner`,
        requestInit
      )
    })
  })

  describe('when first is provided', () => {
    it('should make a request with the limit query param', async () => {
      await service.getNFTs({ first: 10 })

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockUrl}/assets?limit=10`,
        requestInit
      )
    })
  })

  describe('when cursor is provided', () => {
    it('should make a request with the cursor query param', async () => {
      await service.getNFTs({ cursor: 'cursor' })

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockUrl}/assets?cursor=cursor`,
        requestInit
      )
    })
  })

  describe('when skip is provided', () => {
    describe('when first is provided', () => {
      it('should make a request with the limit and offset query param', async () => {
        await service.getNFTs({ first: 10, skip: 20 })

        expect(mockFetch).toHaveBeenCalledWith(
          `${mockUrl}/assets?limit=10&offset=20`,
          requestInit
        )
      })
    })

    describe('when first is not provided', () => {
      it('should make a request without the offset query param', async () => {
        await service.getNFTs({ skip: 20 })

        expect(mockFetch).toHaveBeenCalledWith(`${mockUrl}/assets`, requestInit)
      })
    })
  })

  describe('when all params are provided', () => {
    it('should make a request with all params added to the url', async () => {
      await service.getNFTs({
        owner: 'owner',
        first: 10,
        skip: 20,
        cursor: 'cursor',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockUrl}/assets?owner=owner&limit=10&offset=20&cursor=cursor`,
        requestInit
      )
    })
  })

  describe('when the response is not ok', () => {
    it('should throw an error with a message saying nfts could not be fetch', async () => {
      mockFetch.mockReset()
      mockFetch.mockResolvedValueOnce({ ok: false } as Response)

      await expect(service.getNFTs()).rejects.toEqual(
        new Error('Failed to fetch NFTs')
      )
    })
  })

  it('should return cursor data and the list of nfts', async () => {
    const data = await service.getNFTs()

    expect(data).toEqual({
      next: 'next',
      previous: 'previous',
      nfts: [
        {
          tokenId: 'token_id',
          name: 'name',
          thumbnail: 'image_thumbnail_url',
          contract: {
            name: 'name',
            address: 'address',
          },
        },
      ],
    })
  })
})
