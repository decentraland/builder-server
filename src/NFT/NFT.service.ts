import fetch from 'node-fetch'
import { env } from 'decentraland-commons'
import { GetNFTParams, GetNFTsParams, GetNFTsResponse, NFT } from './NFT.types'

export class NFTService {
  private readonly OPEN_SEA_URL: string
  private readonly OPEN_SEA_API_KEY: string

  constructor() {
    const osURL = env.get<string | undefined>('OPEN_SEA_URL')
    const osApiKey = env.get<string | undefined>('OPEN_SEA_API_KEY')

    if (!osURL) {
      throw new Error('OPEN_SEA_URL not defined')
    }

    if (!osApiKey) {
      throw new Error('OPEN_SEA_API_KEY not defined')
    }

    this.OPEN_SEA_URL = osURL
    this.OPEN_SEA_API_KEY = osApiKey
  }

  /**
   * Obtain a list of NFT filtered by the provided arguments
   * @param args - Arguments used to filter the result
   * @param args.owner - NFTs owned by the provided address
   * @param args.first - Amount of elements to receive
   * @param args.skip - Amount of elements to skip from the result
   * @param args.cursor - Used to obtain the next or the previous list of results
   * @returns An object with the previous and next cursors (if available) and a list of nfts
   */
  public async getNFTs({
    owner,
    first,
    skip,
    cursor,
  }: GetNFTsParams = {}): Promise<GetNFTsResponse> {
    // Build query params for request
    const params: string[] = []

    if (owner) {
      params.push(`owner=${owner}`)
    }

    if (first) {
      params.push(`limit=${first}`)
    }

    if (skip && first) {
      params.push(`offset=${skip}`)
    }

    if (cursor) {
      params.push(`cursor=${cursor}`)
    }

    // Build url
    let url = `${this.OPEN_SEA_URL}/assets`

    if (params.length > 0) {
      url = `${url}?${params.join('&')}`
    }

    // Fetch nfts
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-API-KEY': this.OPEN_SEA_API_KEY,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch NFTs')
    }

    const json = await response.json()

    const externalNFTs: any[] = json.assets

    // Map OpenSea assets into our NFT object
    const nfts = externalNFTs.map(this.mapExternalNFT)

    return {
      next: json.next,
      previous: json.previous,
      nfts,
    }
  }

  /**
   * Get a single NFT
   * @param args - Arguments required to fetch said NFT
   * @param args.contractAddress - The contract address of the NFT
   * @param args.tokenId - The token id of the NFT
   * @returns An NFT or undefined if it could not be found with the provided data
   */
  public async getNFT({
    contractAddress,
    tokenId,
  }: GetNFTParams): Promise<NFT | undefined> {
    // Build url
    let url = `${this.OPEN_SEA_URL}/asset/${contractAddress}/${tokenId}/`

    // Fetch nft
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-API-KEY': this.OPEN_SEA_API_KEY,
      },
    })

    if (!response.ok) {
      return undefined
    }

    const externalNFT = await response.json()

    return this.mapExternalNFT(externalNFT)
  }

  private mapExternalNFT(nft: any): NFT {
    let lastSale: NFT['lastSale'] = null

    if (nft.last_sale) {
      lastSale = {
        eventType: nft.last_sale.event_type,
        paymentToken: { symbol: nft.last_sale.payment_token.symbol },
        quantity: nft.last_sale.quantity,
        totalPrice: nft.last_sale.total_price,
      }
    }

    const owner: NFT['owner'] = {
      address: nft.owner.address,
      config: nft.owner.config,
      profileImageUrl: nft.owner.profile_image_url,
      user: nft.owner.user,
    }

    const traits: NFT['traits'] = (nft.traits as any[]).map((trait) => ({
      displayType: trait.display_type,
      type: trait.trait_type,
      value: trait.value,
    }))

    const contract: NFT['contract'] = {
      description: nft.asset_contract.description,
      externalLink: nft.asset_contract.external_link,
      imageUrl: nft.asset_contract.image_url,
      name: nft.asset_contract.name,
      symbol: nft.asset_contract.symbol,
    }

    return {
      tokenId: nft.token_id,
      imageUrl: nft.image_url,
      backgroundColor: nft.background_color,
      name: nft.name,
      externalLink: nft.external_link,
      owner,
      traits,
      lastSale,
      contract,
    }
  }
}
