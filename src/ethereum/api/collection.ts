import {
  ApolloQueryResult,
  NetworkStatus,
  OperationVariables,
  QueryOptions,
} from '@apollo/client/core'
import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import {
  collectionFragment,
  itemFragment,
  accountFragment,
  rarityFragment,
  CollectionFragment,
  ItemFragment,
  AccountFragment,
  RarityFragment,
} from './fragments'
import { createClient } from './graphClient'
import { Bridge } from './Bridge'

const getCollectionByIdQuery = () => gql`
  query getCollectionById($id: String) {
    collections(where: { id: $id }) {
      ...collectionFragment
    }
  }
  ${collectionFragment()}
`

const getCollectionsQuery = () => gql`
  query getCollections {
    collections {
      ...collectionFragment
    }
  }
  ${collectionFragment()}
`

const getCollectionsByIdQuery = () => gql`
  query getCollectionsById($ids: [ID!]) {
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

const getItemsQuery = () => gql`
  query getItems {
    items {
      ...itemFragment
    }
  }
  ${itemFragment()}
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

const getCommitteeQuery = () => gql`
  query getCommitteeAccounts {
    accounts(where: { isCommitteeMember: true }) {
      ...accountFragment
    }
  }
  ${accountFragment()}
`

const getrRaritiesQuery = () => gql`
  query getRaritiesQuery {
    rarities {
      ...rarityFragment
    }
  }
  ${rarityFragment()}
`

export const COLLECTIONS_URL = env.get('COLLECTIONS_GRAPH_URL', '')
const graphClient = createClient(COLLECTIONS_URL)

export class CollectionAPI {
  bridge: Bridge

  constructor() {
    this.bridge = new Bridge()
  }

  fetchCollection = async (contractAddress: string) => {
    const {
      data: { collections = [] },
    } = await this.query<{
      collections: CollectionFragment[]
    }>({
      query: getCollectionByIdQuery(),
      variables: { id: contractAddress.toLowerCase() },
    })
    return collections.length > 0 ? collections[0] : null
  }

  fetchCollections = async () => {
    const {
      data: { collections = [] },
    } = await this.query<{
      collections: CollectionFragment[]
    }>({ query: getCollectionsQuery() })

    return collections
  }

  fetchCollectionsByAddress = async (contractAddresses: string[]) => {
    const {
      data: { collections = [] },
    } = await this.query<{
      collections: CollectionFragment[]
    }>({
      query: getCollectionsByIdQuery(),
      variables: {
        ids: contractAddresses.map((address) => address.toLowerCase()),
      },
    })

    return collections
  }

  fetchCollectionsByAuthorizedUser = async (userAddress: string) => {
    const {
      data: { creator = [], manager = [], minter = [] },
    } = await this.query<{
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

  fetchItems = async () => {
    const {
      data: { items = [] },
    } = await this.query<{ items: ItemFragment[] }>({
      query: getItemsQuery(),
    })

    return items
  }

  fetchItem = async (contractAddress: string, tokenId: string) => {
    const {
      data: { items = [] },
    } = await this.query<{ items: ItemFragment[] }>({
      query: getItemByIdQuery(),
      variables: { id: this.buildItemId(contractAddress, tokenId) },
    })

    return items.length > 0 ? items[0] : null
  }

  fetchItemsByAuthorizedUser = async (userAddress: string) => {
    const {
      data: { creator = [], manager = [], minter = [] },
    } = await this.query<{
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
    const {
      data: { collections = [] },
    } = await this.query<{
      collections: { items: ItemFragment[] }[]
    }>({
      query: getItemsByContractAddressQuery(),
      variables: { id: contractAddress.toLowerCase() },
    })

    return collections.length > 0 ? collections[0].items : []
  }

  fetchCommittee = async () => {
    const {
      data: { accounts = [] },
    } = await this.query<{
      accounts?: AccountFragment[]
    }>({ query: getCommitteeQuery() })

    return accounts
  }

  fetchRarities = async () => {
    const {
      data: { rarities = [] },
    } = await this.query<{
      rarities?: RarityFragment[]
    }>({ query: getrRaritiesQuery() })

    return rarities
  }

  buildItemId = (contractAddress: string, tokenId: string) => {
    return contractAddress + '-' + tokenId
  }

  private async query<T = any, TVariables = OperationVariables>(
    options: QueryOptions<TVariables, T>
  ): Promise<ApolloQueryResult<T>> {
    try {
      const result = await graphClient.query<T, TVariables>(options)
      return result
    } catch (error) {
      const data = {} as T
      return { data, loading: false, networkStatus: NetworkStatus.error }
    }
  }
}

export const collectionAPI = new CollectionAPI()
