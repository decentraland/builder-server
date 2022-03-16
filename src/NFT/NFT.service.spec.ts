import { env } from 'decentraland-commons'
import fetch, { Response } from 'node-fetch'
import { NFTService } from './NFT.service'

jest.mock('node-fetch')
jest.mock('decentraland-commons')

const mockFetch = fetch as jest.MockedFunction<typeof fetch>
const mockEnv = env as jest.Mocked<typeof env>

const mockUrl = 'https://some-url.com/v1'
const mockApiKey = 'https://some-url.com/v1'

let service: NFTService
let requestInit: RequestInit
let mockExternalNFT: any

beforeEach(() => {
  mockEnv.get.mockReturnValueOnce(mockUrl)
  mockEnv.get.mockReturnValueOnce(mockApiKey)

  service = new NFTService()

  requestInit = {
    headers: {
      Accept: 'application/json',
      'X-API-KEY': mockApiKey,
    },
  }

  mockExternalNFT = {
    token_id: 'token_id',
    image_url: 'image_url',
    background_color: 'background_color',
    name: 'name',
    external_link: 'external_link',
    owner: 'owner',
    traits: [
      {
        display_type: 'display_type',
        trait_type: 'trait_type',
        value: 'value',
      },
    ],
    last_sale: {
      event_type: 'event_type',
      payment_token: {
        symbol: 'symbol',
      },
      quantity: 'quantity',
      total_price: 'total_price',
    },
    asset_contract: {
      description: 'description',
      external_link: 'external_link',
      image_url: 'image_url',
      name: 'name',
      symbol: 'symbol',
    },
  }

  jest.clearAllMocks()
})

describe('when getting a list of nfts', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          next: 'next',
          previous: 'previous',
          assets: [mockExternalNFT],
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
      nfts: [
        {
          backgroundColor: 'background_color',
          contract: {
            description: 'description',
            externalLink: 'external_link',
            imageUrl: 'image_url',
            name: 'name',
            symbol: 'symbol',
          },
          externalLink: 'external_link',
          imageUrl: 'image_url',
          lastSale: {
            eventType: 'event_type',
            paymentToken: {
              symbol: 'symbol',
            },
            quantity: 'quantity',
            totalPrice: 'total_price',
          },
          name: 'name',
          owner: 'owner',
          tokenId: 'token_id',
          traits: [
            {
              displayType: 'display_type',
              type: 'trait_type',
              value: 'value',
            },
          ],
        },
      ],
      previous: 'previous',
    })
  })
})

describe('when getting an nft', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockExternalNFT),
    } as Response)
  })

  describe('when the response is not ok', () => {
    it('should return undefined', async () => {
      mockFetch.mockReset()
      mockFetch.mockResolvedValueOnce({ ok: false } as Response)

      await expect(
        service.getNFT({
          contractAddress: 'contractAddress',
          tokenId: 'tokenId',
        })
      ).resolves.toBeUndefined()
    })
  })

  it('should make a request with contractAddress and tokenId in the url', async () => {
    await service.getNFT({
      contractAddress: 'contractAddress',
      tokenId: 'tokenId',
    })

    expect(mockFetch).toHaveBeenCalledWith(
      `${mockUrl}/asset/contractAddress/tokenId/`,
      requestInit
    )
  })

  it('should return an nft', async () => {
    const nft = await service.getNFT({
      contractAddress: 'contractAddress',
      tokenId: 'tokenId',
    })

    expect(nft).toEqual({
      backgroundColor: 'background_color',
      contract: {
        description: 'description',
        externalLink: 'external_link',
        imageUrl: 'image_url',
        name: 'name',
        symbol: 'symbol',
      },
      externalLink: 'external_link',
      imageUrl: 'image_url',
      lastSale: {
        eventType: 'event_type',
        paymentToken: {
          symbol: 'symbol',
        },
        quantity: 'quantity',
        totalPrice: 'total_price',
      },
      name: 'name',
      owner: 'owner',
      tokenId: 'token_id',
      traits: [
        {
          displayType: 'display_type',
          type: 'trait_type',
          value: 'value',
        },
      ],
    })
  })
})
