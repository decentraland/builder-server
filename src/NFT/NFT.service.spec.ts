import { env } from 'decentraland-commons'
import fetch, { Response } from 'node-fetch'
import { NFTService } from './NFT.service'
import { NFT, OpenSeaV2AccountNFT, OpenSeaV2NFT } from './NFT.types'
import { getMockNFT } from './utils'

jest.mock('node-fetch')
jest.mock('decentraland-commons')

const mockFetch = fetch as jest.MockedFunction<typeof fetch>
const mockEnv = env as jest.Mocked<typeof env>

const mockUrl = 'https://some-url.com/v1'
const mockApiKey = 'https://some-url.com/v1'

let service: NFTService
let requestInit: RequestInit
let mockExternalNFT: OpenSeaV2NFT
let mockExternalNFTByAccount: OpenSeaV2AccountNFT
let mockMappedExternalNFT: NFT
let mockMappedExternalAccountNFT: NFT
let network: string

beforeEach(() => {
  network = 'ethereum'
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
    identifier: '8166776806102523123120990578362437074920',
    collection: 'decentraland',
    contract: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
    token_standard: 'erc721',
    name: 'tuviejapolis',
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
      { trait_type: 'Y', display_type: 'number', max_value: null, value: -24 },
    ],
    owners: [
      { address: '0x87956abc4078a0cc3b89b419928b857b8af826ed', quantity: 1 },
    ],
    rarity: null,
  }

  mockExternalNFTByAccount = {
    identifier: '209',
    collection: 'decentraland-wearables',
    contract: '0x30d3387ff3de2a21bef7032f82d00ff7739e403c',
    token_standard: 'erc721',
    name: 'Wing sneakers',
    description:
      'No run, no swim, just fly. These have a handwritten signature from creators Chestnutbruz and Pablo Estornut. By Mana-fever 2020 © \n' +
      '\n' +
      'DCL Wearable 38/100',
    image_url:
      'https://peer.decentraland.org/content/contents/QmWXP9pDUM22FtbxjXs3faNntAoWtjYQi834B8ATBEb5NY',
    metadata_url:
      'https://wearable-api.decentraland.org/v2/standards/erc721-metadata/collections/mf_sammichgamer/wearables/mf_wingsneakers/38',
    opensea_url:
      'https://opensea.io/assets/ethereum/0x30d3387ff3de2a21bef7032f82d00ff7739e403c/209',
    updated_at: '2022-01-06T21:19:12.837825',
    is_disabled: false,
    is_nsfw: false,
  }

  mockMappedExternalNFT = getMockNFT(mockExternalNFT)
  mockMappedExternalAccountNFT = getMockNFT(mockExternalNFTByAccount)

  jest.clearAllMocks()
})

describe('when getting a list of nfts by account', () => {
  let owner: string
  beforeEach(() => {
    owner = '0xanAddress'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          next: 'next',
          previous: 'previous',
          nfts: [mockExternalNFTByAccount],
        }),
    } as Response)
  })

  describe('when owner is provided', () => {
    it('should make a request with the owner query param', async () => {
      await service.getNFTs({ owner })

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockUrl}/chain/${network}/account/${owner}/nfts`,
        requestInit
      )
    })
  })

  describe('when first is provided', () => {
    it('should make a request with the limit query param', async () => {
      await service.getNFTs({ owner, first: 10 })

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockUrl}/chain/${network}/account/${owner}/nfts?limit=10`,
        requestInit
      )
    })
  })

  describe('when cursor is provided', () => {
    it('should make a request with the cursor query param', async () => {
      await service.getNFTs({ owner, cursor: 'cursor' })

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockUrl}/chain/${network}/account/${owner}/nfts?cursor=cursor`,
        requestInit
      )
    })
  })

  describe('when skip is provided', () => {
    describe('when first is provided', () => {
      it('should make a request with the limit and offset query param', async () => {
        await service.getNFTs({ owner, first: 10, skip: 20 })

        expect(mockFetch).toHaveBeenCalledWith(
          `${mockUrl}/chain/${network}/account/${owner}/nfts?limit=10&offset=20`,
          requestInit
        )
      })
    })

    describe('when first is not provided', () => {
      it('should make a request without the offset query param', async () => {
        await service.getNFTs({ owner, skip: 20 })

        expect(mockFetch).toHaveBeenCalledWith(
          `${mockUrl}/chain/${network}/account/${owner}/nfts`,
          requestInit
        )
      })
    })
  })

  describe('when all params are provided', () => {
    it('should make a request with all params added to the url', async () => {
      await service.getNFTs({
        owner,
        first: 10,
        skip: 20,
        cursor: 'cursor',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockUrl}/chain/${network}/account/${owner}/nfts?limit=10&offset=20&cursor=cursor`,
        requestInit
      )
    })
  })

  describe('when the response is not ok', () => {
    it('should throw an error with a message saying nfts could not be fetch', async () => {
      mockFetch.mockReset()
      mockFetch.mockResolvedValueOnce({ ok: false } as Response)

      await expect(service.getNFTs({ owner })).rejects.toEqual(
        new Error('Failed to fetch NFTs')
      )
    })
  })

  describe('when the response is ok', () => {
    it('should return cursor data and the list of nfts', async () => {
      const data = await service.getNFTs({ owner })

      expect(data).toEqual({
        next: 'next',
        nfts: [mockMappedExternalAccountNFT],
        previous: 'previous',
      })
    })

    describe('and is an ens', () => {
      beforeEach(() => {
        mockFetch.mockReset()
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              next: 'next',
              previous: 'previous',
              nfts: [mockExternalNFTByAccount],
            }),
        } as Response)
      })

      it('should return an nft without owner', async () => {
        const data = await service.getNFTs({ owner })

        expect(data).toEqual({
          next: 'next',
          nfts: [mockMappedExternalAccountNFT],
          previous: 'previous',
        })
      })
    })
  })
})

describe('when getting an nft', () => {
  let contractAddress: string
  let tokenId: string
  beforeEach(() => {
    contractAddress = '0xcontractAddress'
    tokenId = 'tokenId'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ nft: mockExternalNFT }),
    } as Response)
  })

  describe('when the response is not ok', () => {
    it('should return undefined', async () => {
      mockFetch.mockReset()
      mockFetch.mockResolvedValueOnce({ ok: false } as Response)

      await expect(
        service.getNFT({
          contractAddress,
          tokenId,
        })
      ).resolves.toBeUndefined()
    })
  })

  it('should make a request with contractAddress and tokenId in the url', async () => {
    await service.getNFT({
      contractAddress,
      tokenId,
    })

    expect(mockFetch).toHaveBeenCalledWith(
      `${mockUrl}/chain/${network}/contract/${contractAddress}/nfts/${tokenId}`,
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
