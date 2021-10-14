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
import {
  BaseGraphAPI,
  MAX_RESULTS,
  PAGINATION_VARIABLES,
  PAGINATION_ARGUMENTS,
} from './BaseGraphAPI'

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

const getCollectionWithItemsByCollectionIdQuery = () => gql`
  query getCollectionWithItemsByCollectionIdQuery($id: String) {
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

const getItemsByCollectionIdQuery = () => gql`
  query getItems($collectionId: String) {
    items(where: { collection: $collectionId }) {
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

const getRaritiesQuery = () => gql`
  query getRaritiesQuery {
    rarities {
      ...rarityFragment
    }
  }
  ${rarityFragment()}
`

export const COLLECTIONS_URL = env.get('COLLECTIONS_GRAPH_URL', '')

export class CollectionAPI extends BaseGraphAPI {
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

  fetchItemsByContractAddress = async (
    contractAddress: string
  ): Promise<ItemFragment[]> => {
    const {
      data: { items = [] },
    } = await this.query<{ items: ItemFragment[] }>({
      query: getItemsByCollectionIdQuery(),
      variables: { collectionId: contractAddress.toLowerCase() },
    })

    return items
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
      query: getCollectionWithItemsByCollectionIdQuery(),
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
    }>({ query: getRaritiesQuery() })

    return rarities
  }

  buildItemId = (contractAddress: string, tokenId: string) => {
    return contractAddress + '-' + tokenId
  }
}

export const collectionAPI = new CollectionAPI(COLLECTIONS_URL)
