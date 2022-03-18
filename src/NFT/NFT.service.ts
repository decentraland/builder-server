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

    console.log(externalNFT)

    return this.mapExternalNFT(externalNFT)
  }

  private mapExternalNFT(ext: any): NFT {
    const mapAccount = (account: any) => ({
      user: account.user ? { username: account.user.username } : null,
      profileImageUrl: account.profile_img_url,
      address: account.address,
      config: account.config,
    })

    const mapToken = (token: any) => ({
      symbol: token.symbol,
    })

    const mapContract = (contract: any) => ({
      name: contract.name,
      symbol: contract.symbol,
      imageUrl: contract.image_url,
      description: contract.description,
      externalLink: contract.external_link,
    })

    const mapTrait = (trait: any) => ({
      type: trait.trait_type,
      value: trait.value,
      displayType: trait.display_type,
    })

    const mapLastSale = (lastSale: any) => ({
      eventType: lastSale.event_type,
      totalPrice: lastSale.total_price,
      quantity: lastSale.quantity,
      paymentToken: mapToken(lastSale.payment_token),
    })

    const mapOrder = (order: any) => ({
      maker: mapAccount(order.maker),
      currentPrice: order.current_price,
      paymentTokenContract: mapToken(order.payment_token_contract),
    })

    const mapOwnership = (ownership: any) => ({
      owner: mapAccount(ownership.owner),
      quantity: ownership.quantity,
    })

    return {
      tokenId: ext.token_id,
      backgroundColor: ext.background_color,
      imageUrl: ext.image_url,
      imagePreviewUrl: ext.image_preview_url,
      imageThumbnailUrl: ext.image_thumbnail_url,
      imageOriginalUrl: ext.image_original_url,
      name: ext.name,
      description: ext.description,
      externalLink: ext.external_link,
      owner: mapAccount(ext.owner),
      contract: mapContract(ext.asset_contract),
      traits: (ext.traits as any[]).map(mapTrait),
      lastSale: ext.last_sale ? mapLastSale(ext.last_sale) : null,
      sellOrders: ext.sell_orders
        ? (ext.sell_order as any[]).map(mapOrder)
        : null,
      orders: ext.orders ? (ext.orders as any[]).map(mapOrder) : null,
      topOwnerships: ext.top_ownerships
        ? (ext.top_ownerships as any[]).map(mapOwnership)
        : null,
    }
  }
}
