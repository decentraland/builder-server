// NFT Entity
export type NFT = {
  tokenId: string
  imageUrl: string
  name: string
  description: string
  contract: { address: string; name: string }
}

// Service types
export type GetNFTsParams = {
  owner?: string
  first?: number
  skip?: number
  cursor?: string
  network?: string
}

export type GetNFTsResponse = {
  next: string | null
  previous: string | null
  nfts: NFT[]
}

export type GetNFTParams = {
  contractAddress: string
  tokenId: string
  network?: string
}

// OpensSea API response types
export type OpenSeaV2NFT = {
  nft: {
    identifier: string
    collection: string
    contract: string
    token_standard: string
    name: string
    description: string
    image_url: string
    metadata_url: string
    created_at: string
    updated_at: string
    is_disabled: boolean
    is_nsfw: boolean
    animation_url: string
    is_suspicious: boolean
    creator: string
    traits: [
      {
        trait_type: string
        display_type: number
        max_value: string
        trait_count: number
        value: string
      }
    ]
    owners: [
      {
        address: string
        quantity: number
      }
    ]
    rarity: {
      strategy_id: {}
      strategy_version: string
      rank: number
      score: number
      calculated_at: ''
      max_rank: number
      total_supply: number
      ranking_features: {
        unique_attribute_count: number
      }
    }
  }
}
