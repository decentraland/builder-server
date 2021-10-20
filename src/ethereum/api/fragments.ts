import gql from 'graphql-tag'
import { ItemRarity } from '../../Item'
import { WearableCategory } from '../../Item/wearable/types'

export const itemFragment = () => gql`
  fragment itemFragment on Item {
    id
    blockchainId
    urn
    totalSupply
    price
    beneficiary
    managers
    minters
    contentHash
    collection {
      id
      creator
      owner
      name
      isApproved
      minters
      managers
    }
    metadata {
      wearable {
        name
        description
        category
        rarity
        bodyShapes
      }
    }
  }
`

export const collectionFragment = () => gql`
  fragment collectionFragment on Collection {
    id
    creator
    owner
    name
    isApproved
    minters
    managers
    reviewedAt
    updatedAt
    createdAt
  }
`

export const thirdPartyFragment = () => gql`
  fragment thirdPartyFragment on ThirdParty {
    id
    managers
    maxItems
    totalItems
    metadata {
      type
      thirdParty {
        name
        description
      }
    }
  }
`

export const accountFragment = () => gql`
  fragment accountFragment on Account {
    id
    address
    isCommitteeMember
  }
`

export const rarityFragment = () => gql`
  fragment rarityFragment on Rarity {
    id
    name
    price
    maxSupply
  }
`

export type ItemFragment = {
  id: string
  blockchainId: string
  urn: string
  totalSupply: string
  price: string
  beneficiary: string
  minters: string[]
  managers: string[]
  contentHash: string
  collection: CollectionFragment
  metadata: CollectionMetadataFragment
}

export type CollectionFragment = {
  id: string
  creator: string
  owner: string
  name: string
  isApproved: boolean
  minters: string[]
  managers: string[]
  reviewedAt: string
  updatedAt: string
  createdAt: string
}

export type ThirdPartyFragment = {
  id: string
  managers: string[]
  maxItems: number
  totalItems: number
  metadata: ThirdPartyMetadata
}

export type ThirdPartyMetadata = {
  type: ThirdPartyMetadataType
  thirdParty: { name: string; description: string } | null
}

export enum ThirdPartyMetadataType {
  THIRD_PARTY_V1 = 'third_party_v1',
}

export type AccountFragment = {
  id: string
  address: string
  isCommitteeMember: boolean
}

export type RarityFragment = {
  id: string
  name: string
  price: string
  maxSupply: string
}

export type CollectionMetadataFragment = {
  wearable?: WearableFragment
}

export type WearableFragment = {
  name: string
  description: string
  category: WearableCategory
  rarity: ItemRarity
  bodyShapes: string[]
}
