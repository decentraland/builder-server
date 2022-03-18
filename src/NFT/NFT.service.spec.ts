import { env } from 'decentraland-commons'
import fetch, { Response } from 'node-fetch'
import { NFTService } from './NFT.service'
import { NFT } from './NFT.types'
import { getMockNFT } from './utils'

jest.mock('node-fetch')
jest.mock('decentraland-commons')

const mockFetch = fetch as jest.MockedFunction<typeof fetch>
const mockEnv = env as jest.Mocked<typeof env>

const mockUrl = 'https://some-url.com/v1'
const mockApiKey = 'https://some-url.com/v1'

let service: NFTService
let requestInit: RequestInit
let mockExternalNFT: any
let mockMappedExternalNFT: NFT

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
    background_color: 'background_color',
    asset_contract: {
      address: 'address',
      created_date: 'created_date',
      name: 'name',
      nft_version: 'nft_version',
      schema_name: 'schema_name',
      symbol: 'symbol',
      total_supply: 'total_supply',
      description: 'description',
      external_link: 'external_link',
      image_url: 'image_url',
    },
    description: 'description',
    external_link: 'external_link',
    image_original_url: 'image_original_url',
    image_preview_url: 'image_preview_url',
    image_thumbnail_url: 'image_thumbnail_url',
    image_url: 'image_url',
    last_sale: {
      event_type: 'event_type',
      event_timestamp: 'event_timestamp',
      total_price: 'total_price',
      quantity: 'quantity',
      payment_token: {
        id: 100,
        symbol: 'symbol',
        address: 'address',
        image_url: 'image_url',
        name: 'name',
        decimals: 18,
        eth_price: 'eth_price',
        usd_price: 'usd_price',
      },
      transaction: {
        id: 100,
        from_account: {
          address: 'address',
          config: 'config',
          profile_img_url: 'profile_img_url',
          user: {
            username: 'username',
          },
        },
        to_account: {
          address: 'address',
          config: 'config',
          profile_img_url: 'profile_img_url',
          user: {
            username: 'username',
          },
        },
        transaction_hash: 'transaction_hash',
      },
    },
    name: 'name',
    orders: [
      {
        maker: {
          address: 'address',
          config: 'config',
          profile_img_url: 'profile_img_url',
          user: {
            username: 'username',
          },
        },
        current_price: 'current_price',
        payment_token_contract: {
          id: 100,
          symbol: 'symbol',
          address: 'address',
          image_url: 'image_url',
          name: 'name',
          decimals: 18,
          eth_price: 'eth_price',
          usd_price: 'usd_price',
        },
      },
    ],
    owner: {
      address: 'address',
      config: 'config',
      profile_img_url: 'profile_img_url',
      user: {
        username: 'username',
      },
    },
    sell_orders: [
      {
        maker: {
          address: 'address',
          config: 'config',
          profile_img_url: 'profile_img_url',
          user: {
            username: 'username',
          },
        },
        current_price: 'current_price',
        payment_token_contract: {
          id: 100,
          symbol: 'symbol',
          address: 'address',
          image_url: 'image_url',
          name: 'name',
          decimals: 18,
          eth_price: 'eth_price',
          usd_price: 'usd_price',
        },
      },
    ],
    token_id: 'token_id',
    top_ownerships: [
      {
        owner: {
          address: 'address',
          config: 'config',
          profile_img_url: 'profile_img_url',
          user: {
            username: 'username',
          },
        },
        quantity: 'quantity',
      },
    ],
    traits: [
      {
        display_type: 'display_type',
        trait_type: 'trait_type',
        value: 'value',
      },
    ],
  }

  mockMappedExternalNFT = getMockNFT()

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
      nfts: [mockMappedExternalNFT],
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

    expect(nft).toEqual(mockMappedExternalNFT)
  })
})
