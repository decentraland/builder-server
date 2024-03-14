import { NFT, OpenSeaV2AccountNFT, OpenSeaV2NFT } from './NFT.types'

export const getMockNFT = (mock: OpenSeaV2NFT | OpenSeaV2AccountNFT): NFT => ({
  tokenId: mock.identifier,
  imageUrl: mock.image_url,
  name: mock.name,
  contract: {
    address: mock.contract,
    name: mock.collection,
  },
  description: mock.description || '',
})
