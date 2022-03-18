import { NFT } from './NFT.types'

export const getMockNFT = (): NFT => ({
  backgroundColor: 'background_color',
  contract: {
    address: 'address',
    createdDate: 'created_date',
    name: 'name',
    nftVersion: 'nft_version',
    schemaName: 'schema_name',
    symbol: 'symbol',
    totalSupply: 'total_supply',
    description: 'description',
    externalLink: 'external_link',
    imageUrl: 'image_url',
  },
  description: 'description',
  externalLink: 'external_link',
  imageOriginalUrl: 'image_original_url',
  imagePreviewUrl: 'image_preview_url',
  imageThumbnailUrl: 'image_thumbnail_url',
  imageUrl: 'image_url',
  lastSale: {
    eventType: 'event_type',
    paymentToken: {
      symbol: 'symbol',
    },
    quantity: 'quantity',
    totalPrice: 'total_price',
  },
  name: 'name',
  orders: [
    {
      maker: {
        address: 'address',
        config: 'config',
        profileImageUrl: 'profile_img_url',
        user: {
          username: 'username',
        },
      },
      currentPrice: 'current_price',
      paymentTokenContract: {
        symbol: 'symbol',
      },
    },
  ],
  owner: {
    address: 'address',
    config: 'config',
    profileImageUrl: 'profile_img_url',
    user: {
      username: 'username',
    },
  },
  sellOrders: [
    {
      maker: {
        address: 'address',
        config: 'config',
        profileImageUrl: 'profile_img_url',
        user: {
          username: 'username',
        },
      },
      currentPrice: 'current_price',
      paymentTokenContract: {
        symbol: 'symbol',
      },
    },
  ],
  tokenId: 'token_id',
  topOwnerships: [
    {
      owner: {
        address: 'address',
        config: 'config',
        profileImageUrl: 'profile_img_url',
        user: {
          username: 'username',
        },
      },
      quantity: 'quantity',
    },
  ],
  traits: [
    {
      displayType: 'display_type',
      type: 'trait_type',
      value: 'value',
    },
  ],
})
