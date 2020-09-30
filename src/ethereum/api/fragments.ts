import gql from 'graphql-tag'

export const itemFields = () => gql`
  fragment itemFields on Item {
    id
    blockchainId
    totalSupply
    price
    beneficiary
  }
`

export const collectionFields = () => gql`
  fragment collectionFields on Collection {
    id
    creator
    owner
    name
    isApproved
    minters
    managers
  }
`

export const itemFragment = () => gql`
  fragment itemFragment on Item {
    ...itemFields
    collection {
      ...collectionFields
    }
  }
  ${itemFields()}
  ${collectionFields()}
`

export const collectionFragment = () => gql`
  fragment collectionFragment on Collection {
    ...collectionFields
    items {
      ...itemFields
    }
  }
  ${itemFields()}
  ${collectionFields()}
`

export type ItemFields = {
  id: string
  blockchainId: string
  totalSupply: string
  price: string
  beneficiary: string
}

export type CollectionFields = {
  id: string
  creator: string
  owner: string
  name: string
  isApproved: boolean
  minters: string[]
  managers: string[]
}

export type ItemFragment = ItemFields & {
  collection: CollectionFields
}

export type CollectionFragment = CollectionFields & {
  items: ItemFields[]
}
