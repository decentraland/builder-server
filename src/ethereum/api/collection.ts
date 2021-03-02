import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import {
  collectionFragment,
  itemFragment,
  CollectionFragment,
  ItemFragment,
} from './fragments'
import { createClient } from './client'
import { Bridge } from './Bridge'

const getCollectionByIdQuery = () => gql`
  query getCollectionById($id: String) {
    collections(where: { id: $id }) {
      ...collectionFragment
    }
  }
  ${collectionFragment()}
`

const getCollectionsByIdQuery = () => gql`
  query getCollectionsById($ids: [ID!]!) {
    collections(where: { id_in: $ids }) {
      ...collectionFragment
    }
  }
  ${collectionFragment()}
`

const getCollectionsByAuthorizedUserQuery = () => gql`
  query getCollectionsByCreator($user: String, $users: [String!]) {
    creator: collections(where: { creator: $user }) {
      ...collectionFragment
    }
    manager: collections(where: { managers_contains: $users }) {
      ...collectionFragment
    }
    minter: collections(where: { minters_contains: $users }) {
      ...collectionFragment
    }
  }
  ${collectionFragment()}
`

const getItemByIdQuery = () => gql`
  query getItem($id: String) {
    items(where: { id: $id }) {
      ...itemFragment
    }
  }
  ${itemFragment()}
`

const getItemsByAuthorizedUserQuery = () => gql`
  query getItemsByOwnerCreator($user: String, $users: [String]) {
    creator: collections(where: { creator: $user }) {
      items {
        ...itemFragment
      }
    }
    manager: collections(where: { managers_contains: $users }) {
      items {
        ...itemFragment
      }
    }
    minter: collections(where: { minters_contains: $users }) {
      items {
        ...itemFragment
      }
    }
  }
  ${itemFragment()}
`

const getItemsByContractAddressQuery = () => gql`
  query getItemsByContractAddress($id: String) {
    collections(where: { id: $id }) {
      items {
        ...itemFragment
      }
    }
  }
  ${itemFragment()}
`

export const COLLECTIONS_URL = env.get('COLLECTIONS_GRAPH_URL', '')
const graphClient = createClient(COLLECTIONS_URL)

export class CollectionAPI {
  bridge: Bridge

  constructor() {
    this.bridge = new Bridge()
  }

  fetchCollection = async (contractAddress: string) => {
    const { data } = await graphClient.query<{
      collections: CollectionFragment[]
    }>({
      query: getCollectionByIdQuery(),
      variables: { id: contractAddress.toLowerCase() },
    })
    return data.collections.length > 0 ? data.collections[0] : null
  }

  fetchCollections = async (contractAddresses: string[]) => {
    const { data } = await graphClient.query<{
      collections: CollectionFragment[]
    }>({
      query: getCollectionsByIdQuery(),
      variables: {
        ids: contractAddresses.map((address) => address.toLowerCase()),
      },
    })

    return data.collections
  }

  fetchCollectionsByAuthorizedUser = async (userAddress: string) => {
    const {
      data: { creator, manager, minter },
    } = await graphClient.query<{
      creator: CollectionFragment[]
      manager: CollectionFragment[]
      minter: CollectionFragment[]
    }>({
      query: getCollectionsByAuthorizedUserQuery(),
      variables: {
        user: userAddress.toLowerCase(),
        users: [userAddress.toLowerCase()],
      },
    })

    return [...creator, ...manager, ...minter]
  }

  fetchItem = async (contractAddress: string, tokenId: string) => {
    const { data } = await graphClient.query<{ items: ItemFragment[] }>({
      query: getItemByIdQuery(),
      variables: { id: this.buildItemId(contractAddress, tokenId) },
    })

    return data.items.length > 0 ? data.items[0] : null
  }

  fetchItemsByAuthorizedUser = async (userAddress: string) => {
    const {
      data: { creator, manager, minter },
    } = await graphClient.query<{
      creator: { items: ItemFragment[] }[]
      manager: { items: ItemFragment[] }[]
      minter: { items: ItemFragment[] }[]
    }>({
      query: getItemsByAuthorizedUserQuery(),
      variables: {
        user: userAddress.toLowerCase(),
        users: [userAddress.toLowerCase()],
      },
    })

    return [...creator, ...manager, ...minter].reduce(
      (items, collection) => [...items, ...collection.items],
      [] as ItemFragment[]
    )
  }

  fetchItemsByContractAddress = async (contractAddress: string) => {
    const { data } = await graphClient.query<{
      collections: { items: ItemFragment[] }[]
    }>({
      query: getItemsByContractAddressQuery(),
      variables: { id: contractAddress.toLowerCase() },
    })

    return data.collections.length > 0 ? data.collections[0].items : []
  }

  buildItemId = (contractAddress: string, tokenId: string) => {
    return contractAddress + '-' + tokenId
  }
}

export const collectionAPI = new CollectionAPI()
