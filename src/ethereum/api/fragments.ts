import gql from 'graphql-tag'

export const itemFragment = () => gql`
  fragment itemFragment on Item {
    id
    blockchainId
    totalSupply
    price
    beneficiary
    managers
    minters
    collection {
      id
      creator
      owner
      name
      isApproved
      minters
      managers
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
  totalSupply: string
  price: string
  beneficiary: string
  minters: string[]
  managers: string[]
  collection: CollectionFragment
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
