export type GetNFTsParams = {
  owner?: string
  first?: number
  skip?: number
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
