export type NFT = {
  tokenId: string
  backgroundColor: string | null
  imageUrl: string
  imagePreviewUrl: string
  imageThumbnailUrl: string
  imageOriginalUrl: string | null
  name: string | null
  description: string | null
  externalLink: string | null
  owner: NFTAccount
  contract: {
    name: string
    symbol: string
    imageUrl: string | null
    description: string
    externalLink: string | null
  }
  traits: {
    type: string
    value: string | number
    displayType: string | null
  }[]
  lastSale: {
    eventType: string
    totalPrice: string
    quantity: string
    paymentToken: NFTToken
  } | null
  sellOrders: NFTOrder[] | null
  orders: NFTOrder[] | null
  topOwnerships: NFTOwnership[] | null
}

type NFTAccount = {
  user: { username: string } | null
  profileImageUrl: string
  address: string
  config: string
}

type NFTOrder = {
  maker: NFTAccount
  currentPrice: string
  paymentTokenContract: NFTToken
}

type NFTToken = {
  symbol: string
}

type NFTOwnership = {
  owner: NFTAccount
  quantity: string
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
