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

const MAX_RESULTS = 1000

const PAGINATION_VARIABLES = `
  $first: Int = ${MAX_RESULTS}
  $skip: Int = 0
  $orderBy: String
  $orderDirection: String
`

const PAGINATION_ARGUMENTS = `
  first: $first
  skip: $skip
  orderBy: $orderBy
  orderDirection: $orderDirection
`

const getCollectionByIdQuery = () => gql`
  query getCollectionById($id: String) {
    collections(where: { id: $id }) {
      ...collectionFragment
    }
  }
  ${collectionFragment()}
`

const getCollectionsQuery = () => gql`
  query getCollections(${PAGINATION_VARIABLES}) {
    collections(${PAGINATION_ARGUMENTS}) {
      ...collectionFragment
    }
  }
  ${collectionFragment()}
`

const getCollectionsByAuthorizedUserQuery = () => gql`
  query getCollectionsByCreator(${PAGINATION_VARIABLES}, $user: String, $users: [String!]) {
    creator: collections(${PAGINATION_ARGUMENTS}, where: { creator: $user }) {
      ...collectionFragment
    }
    manager: collections(${PAGINATION_ARGUMENTS}, where: { managers_contains: $users }) {
      ...collectionFragment
    }
    minter: collections(${PAGINATION_ARGUMENTS}, where: { minters_contains: $users }) {
      ...collectionFragment
    }
  }
  ${collectionFragment()}
`

const getCollectionWithItemsByContractAddressQuery = () => gql`
  query getCollectionWithItemsByContractAddressQuery($id: String) {
    collections(first: ${MAX_RESULTS}, where: { id: $id }) {
      ...collectionFragment
      items {
        ...itemFragment
      }
    }
  }
  ${collectionFragment()}
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

const getItemsQuery = () => gql`
  query getItems(${PAGINATION_VARIABLES}) {
    items(${PAGINATION_ARGUMENTS}) {
      ...itemFragment
    }
  }
  ${itemFragment()}
`

const getItemsByAuthorizedUserQuery = () => gql`
  query getItemsByOwnerCreator(${PAGINATION_VARIABLES}, $user: String, $users: [String]) {
    creator: collections(${PAGINATION_ARGUMENTS}, where: { creator: $user }) {
      items {
        ...itemFragment
      }
    }
    manager: collections(${PAGINATION_ARGUMENTS}, where: { managers_contains: $users }) {
      items {
        ...itemFragment
      }
    }
    minter: collections(${PAGINATION_ARGUMENTS}, where: { minters_contains: $users }) {
      items {
        ...itemFragment
      }
    }
  }
  ${itemFragment()}
`

const getCommitteeQuery = () => gql`
  query getCommitteeAccounts(${PAGINATION_VARIABLES}) {
    accounts(${PAGINATION_ARGUMENTS}, where: { isCommitteeMember: true }) {
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

  fetchCollections = async (): Promise<CollectionFragment[]> => {
    return this.paginate(['collections'], {
      query: getCollectionsQuery(),
    })
  }

  fetchCollectionsByAuthorizedUser = async (
    userAddress: string
  ): Promise<CollectionFragment[]> => {
    return this.paginate(['creator', 'manager', 'minter'], {
      query: getCollectionsByAuthorizedUserQuery(),
      variables: {
        user: userAddress.toLowerCase(),
        users: [userAddress.toLowerCase()],
      },
    })
  }

  fetchItems = async (): Promise<ItemFragment[]> => {
    return this.paginate(['items'], { query: getItemsQuery() })
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

  fetchItemsByAuthorizedUser = async (
    userAddress: string
  ): Promise<ItemFragment[]> => {
    const result: { items: ItemFragment[] }[] = await this.paginate(
      ['creator', 'manager', 'minter'],
      {
        query: getItemsByAuthorizedUserQuery(),
        variables: {
          user: userAddress.toLowerCase(),
          users: [userAddress.toLowerCase()],
        },
      }
    )

    return result.reduce(
      (items, collection) => [...items, ...collection.items],
      [] as ItemFragment[]
    )
  }

  fetchCollectionWithItemsByContractAddress = async (
    contractAddress: string
  ): Promise<{
    collection?: CollectionFragment
    items: ItemFragment[]
  }> => {
    const {
      data: { collections = [] },
    } = await this.query<{
      collections: (CollectionFragment & { items: ItemFragment[] })[]
    }>({
      query: getCollectionWithItemsByContractAddressQuery(),
      variables: { id: contractAddress.toLowerCase() },
    })

    if (collections.length > 0) {
      const [{ items, ...collection }] = collections
      return { collection, items }
    }

    return { collection: undefined, items: [] }
  }

  fetchCommittee = async (): Promise<AccountFragment[]> => {
    return this.paginate(['accounts'], { query: getCommitteeQuery() })
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

  private async paginate<T, K extends string, TVariables = OperationVariables>(
    keys: K[],
    options: QueryOptions<TVariables, T>
  ): Promise<T[]> {
    const queryOptions = {
      ...options,
      variables: { ...options.variables, skip: 0 },
    }
    let pagination: T[] = []
    let partialResult: T[] | undefined

    while (!partialResult || partialResult.length === MAX_RESULTS) {
      const queryResult = await this.query<Record<K, T[]>, TVariables>(
        queryOptions as any // forcing typescript to accept the skip variable
      )
      partialResult = []
      for (const key of keys) {
        partialResult = partialResult.concat(queryResult.data[key])
      }
      pagination = pagination.concat(partialResult)
      queryOptions.variables.skip += MAX_RESULTS
    }

    return pagination
  }
}

export const collectionAPI = new CollectionAPI()
