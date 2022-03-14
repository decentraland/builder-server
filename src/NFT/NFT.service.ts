import fetch from 'node-fetch'
import { env } from 'decentraland-commons'
import { GetNFTsParams, NFT } from './NFT.types'

const OPEN_SEA_URL = (() => {
  const value = env.get<string | undefined>('OPEN_SEA_URL')
  if (!value) {
    throw new Error('OPEN_SEA_URL not defined')
  }
  return value
})()

const OPEN_SEA_API_KEY = (() => {
  const value = env.get<string | undefined>('OPEN_SEA_API_KEY')
  if (!value) {
    throw new Error('OPEN_SEA_API_KEY not defined')
  }
  return value
})()

export class NFTService {
  public getNFTs = async (args: GetNFTsParams = {}): Promise<NFT[]> => {
    const { owner, first, skip } = args

    // Build query params for request
    const params: string[] = []

    if (owner) {
      params.push(`owner=${owner}`)
    }

    if (first) {
      params.push(`limit=${first}`)
    }

    if (skip && first) {
      params.push(`offset=${(skip / first) | 0}`)
    }

    // Build url
    let url = `${OPEN_SEA_URL}/assets`

    if (params.length > 0) {
      url = `${url}?${params.join('&')}`
    }

    // Fetch nfts
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'X-API-KEY': OPEN_SEA_API_KEY },
    })

    if (!response.ok) {
      return []
    }

    const json = await response.json()

    const openSeaAssets: any[] = json.assets

    // Map OpenSea assets into our NFT object
    const nfts = openSeaAssets.map((nft) => ({
      tokenId: nft.token_id,
      name: nft.name,
      thumbnail: nft.image_thumbnail_url,
      contract: {
        name: nft.asset_contract.name,
        address: nft.asset_contract.address,
      },
    }))

    return nfts
  }
}
