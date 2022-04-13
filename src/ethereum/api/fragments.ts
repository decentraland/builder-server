import { Rarity, WearableCategory } from '@dcl/schemas'
import gql from 'graphql-tag'

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
    root
    managers
    maxItems
    metadata {
      type
      thirdParty {
        name
        description
      }
    }
  }
`

export const thirdPartyItemFragment = () => gql`
  fragment thirdPartyItemFragment on Item {
    urn
    blockchainItemId
    contentHash
    isApproved
    reviewedAt
    updatedAt
    createdAt
    metadata {
      itemWearable {
        name
        description
        category
        bodyShapes
      }
    }
    thirdParty {
      id
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

export const tiersFragment = () => gql`
  fragment tiersFragment on Tier {
    id
    value
    price
  }
`

export const receiptsFragment = () => gql`
  fragment receiptsFragment on Receipt {
    id
    qty
    signer
  }
`

export type ReceiptFragment = {
  id: string
  qty: string
  signer: string
  createdAt: string
}

export type TierFragment = {
  id: string
  value: string
  price: string
}

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
  /** Collection address */
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
  root: string
  managers: string[]
  maxItems: string
  metadata: ThirdPartyMetadata
}

type ThirdPartyItemWearableMetadata = {
  name: string | null
  description: string | null
  category: WearableCategory | null
  bodyShapes: BodyShape[] | null
}

export type ThirdPartyItemFragment = {
  urn: string
  blockchainItemId: string
  contentHash: string
  isApproved: boolean
  reviewedAt: string
  updatedAt: string
  createdAt: string
  metadata: ThirdPartyItemMetadata
  thirdParty: {
    id: string
  }
}

export type ThirdPartyMetadata = {
  type: ThirdPartyMetadataType
  thirdParty: { name: string; description: string } | null
}

type ThirdPartyItemMetadata = {
  type: ThirdPartyItemMetadataType | undefined
  itemWearable: ThirdPartyItemWearableMetadata
}

export enum ThirdPartyMetadataType {
  THIRD_PARTY_V1 = 'third_party_v1',
}

export enum ThirdPartyItemMetadataType {
  third_party_v1 = 'third_party_v1',
  item_wearable_v1 = 'item_wearable_v1',
}

enum BodyShape {
  BaseMale,
  BaseFemale,
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
  rarity: Rarity
  bodyShapes: string[]
}
