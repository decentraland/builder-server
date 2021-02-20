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
}
