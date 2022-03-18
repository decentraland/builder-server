// NFT Entity
export type NFT = {
  tokenId: string
  backgroundColor: string | null
  imageUrl: string
  imagePreviewUrl: string | null
  imageThumbnailUrl: string | null
  imageOriginalUrl: string | null
  name: string | null
  description: string | null
  externalLink: string | null
  owner: NFTAccount
  contract: NFTContract
  traits: NFTTrait[]
  lastSale: NFTSale | null
  sellOrders: NFTOrder[] | null
  orders: NFTOrder[] | null
  topOwnerships: NFTOwnership[] | null
}

export type NFTAccount = {
  user: { username: string } | null
  profileImageUrl: string
  address: string
  config: string
}

export type NFTContract = {
  address: string
  createdDate: string
  name: string
  nftVersion: string | null
  schemaName: string
  symbol: string
  totalSupply: string | null
  description: string
  externalLink: string | null
  imageUrl: string | null
}

export type NFTTrait = {
  type: string
  value: string | number
  displayType: string | null
}

export type NFTSale = {
  eventType: string
  eventTimestamp: string
  totalPrice: string
  quantity: string
  paymentToken: NFTToken
  transaction: NFTTransaction
}

export type NFTOrder = {
  maker: NFTAccount
  currentPrice: string
  paymentTokenContract: NFTToken
}

export type NFTOwnership = {
  owner: NFTAccount
  quantity: string
}

export type NFTToken = {
  id: number
  symbol: string
  address: string
  imageUrl: string
  name: string
  decimals: number
  ethPrice: string
  usdPrice: string
}

export type NFTTransaction = {
  id: number
  fromAccount: NFTAccount
  toAccount: NFTAccount
  transactionHash: string
}

// Service types
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
