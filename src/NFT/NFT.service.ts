import fetch from 'node-fetch'
import { env } from 'decentraland-commons'
import {
  GetNFTParams,
  GetNFTsParams,
  GetNFTsResponse,
  NFT,
  NFTAccount,
  NFTContract,
  NFTSale,
  NFTOrder,
  NFTOwnership,
  NFTToken,
  NFTTrait,
  NFTTransaction,
} from './NFT.types'

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

  private mapExternalNFT(ext: any): NFT {
    const mapAccount = (account: any): NFTAccount => ({
      user: account.user ? { username: account.user.username } : null,
      profileImageUrl: account.profile_img_url,
      address: account.address,
      config: account.config,
    })

    const mapToken = (token: any): NFTToken => ({
      id: token.id,
      symbol: token.symbol,
      address: token.address,
      imageUrl: token.image_url,
      name: token.name,
      decimals: token.decimals,
      ethPrice: token.eth_price,
      usdPrice: token.usd_price,
    })

    const mapContract = (contract: any): NFTContract => ({
      address: contract.address,
      createdDate: contract.created_date,
      name: contract.name,
      nftVersion: contract.nft_version,
      schemaName: contract.schema_name,
      symbol: contract.symbol,
      totalSupply: contract.total_supply,
      description: contract.description,
      externalLink: contract.external_link,
      imageUrl: contract.image_url,
    })

    const mapTrait = (trait: any): NFTTrait => ({
      type: trait.trait_type,
      value: trait.value,
      displayType: trait.display_type,
    })

    const mapTransaction = (transaction: any): NFTTransaction => ({
      id: transaction.id,
      fromAccount: mapAccount(transaction.from_account),
      toAccount: mapAccount(transaction.to_account),
      transactionHash: transaction.transaction_hash,
    })

    const mapSale = (sale: any): NFTSale => ({
      eventType: sale.event_type,
      eventTimestamp: sale.event_timestamp,
      totalPrice: sale.total_price,
      quantity: sale.quantity,
      paymentToken: mapToken(sale.payment_token),
      transaction: mapTransaction(sale.transaction),
    })

    const mapOrder = (order: any): NFTOrder => ({
      maker: mapAccount(order.maker),
      currentPrice: order.current_price,
      paymentTokenContract: mapToken(order.payment_token_contract),
    })

    const mapOwnership = (ownership: any): NFTOwnership => ({
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
      lastSale: ext.last_sale ? mapSale(ext.last_sale) : null,
      sellOrders: ext.sell_orders
        ? (ext.sell_orders as any[]).map(mapOrder)
        : null,
      orders: ext.orders ? (ext.orders as any[]).map(mapOrder) : null,
      topOwnerships: ext.top_ownerships
        ? (ext.top_ownerships as any[]).map(mapOwnership)
        : null,
    }
  }
}
