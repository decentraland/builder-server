export type NFT = {
  tokenId: string
  imageUrl: string
  backgroundColor: string
  name: string
  externalLink: string
  owner: string
  contract: {
    name: string
    symbol: string
    imageUrl: string
    description: string
    externalLink: string
  }
  traits: {
    type: string
    value: string | number
    displayType: string
  }[]
  lastSale: {
    eventType: string
    totalPrice: string
    quantity: string
    paymentToken: {
      symbol: string
    }
  } | null
}

export type GetNFTsParams = {
  owner?: string
  first?: number
  skip?: number
  cursor?: string
}

export type GetNFTsResponse = {
  next: string | null
  previous: string | null
  nfts: NFT[]
}

export type GetNFTParams = {
  contractAddress: string
  tokenId: string
}
