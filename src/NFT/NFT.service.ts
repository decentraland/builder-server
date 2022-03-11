import fetch from 'node-fetch'
import { env } from 'decentraland-commons'
import { GetNFTsParams, NFT } from './NFT.types'

const OPEN_SEA_URL = env.get<string | undefined>('OPEN_SEA_URL')!
const OPEN_SEA_API_KEY = env.get<string | undefined>('OPEN_SEA_API_KEY')!

export class NFTService {
  public getNFTs = async ({ owner, first, skip }: GetNFTsParams = {}): Promise<
    NFT[]
  > => {
    // Build query params for request
    const params: string[] = []

    if (owner) {
      params.push(`owner=${owner}`)
    }

    if (first) {
      params.push(`limit=${first}`)
    }

    if (skip && first) {
      const cursor = (first / skip) | 0
      params.push(`cursor=${cursor}`)
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
