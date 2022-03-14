export type GetNFTsParams = {
  owner?: string
  first?: number
  skip?: number
  cursor?: string
}

export type NFT = {
  tokenId: string
  name: string
  thumbnail: string
  contract: {
    name: string
    address: string
  }
}

export type GetNFTsResponse = {
  next: string | null
  previous: string | null
  nfts: NFT[]
}