import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import { createConsoleLogComponent } from '@well-known-components/logger'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { logExecutionTime } from '../../utils/logging'
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
  PAGINATION_VARIABLES,
  PAGINATION_ARGUMENTS,
} from './BaseGraphAPI'

export type CollectionQueryFilters = {
  isApproved?: boolean
}

const getCollectionByIdQuery = () => gql`
  query getCollectionById($id: String) {
    collections(where: { id: $id }) {
      ...collectionFragment
    }
  }
  ${collectionFragment()}
`

const getCollectionsQuery = ({ isApproved }: CollectionQueryFilters) => {
  const where: string[] = []

  if (isApproved !== undefined) {
    where.push(`isApproved : ${isApproved}`)
  }

  return gql`
    query getCollections(${PAGINATION_VARIABLES}) {
      collections(${PAGINATION_ARGUMENTS}, where: { ${where.join('\n')} }) {
        ...collectionFragment
      }
    }
    ${collectionFragment()}
  `
}

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

const getCollectionWithItemByIdsQuery = () => gql`
  query getCollectionWithItemByIds($id: String, $itemId: String) {
    collections(where: { id: $id }) {
      ...collectionFragment
    }
    items(where: { id: $itemId }) {
      ...itemFragment
    }
  }
  ${collectionFragment()}
  ${itemFragment()}
`

const getCollectionWithItemsByCollectionIdQuery = () => gql`
  query getCollectionWithItemsByCollectionId($id: String) {
    collections(where: { id: $id }) {
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
  logger: ILoggerComponent.ILogger

  constructor(url: string) {
    super(url)
    this.logger = createConsoleLogComponent().getLogger('Collections GraphAPI')
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

  fetchCollections = async (
    filters: CollectionQueryFilters
  ): Promise<CollectionFragment[]> => {
    return this.paginate(['collections'], {
      query: getCollectionsQuery(filters),
    })
  }

  fetchCollectionsByAuthorizedUser = async (
    userAddress: string
  ): Promise<CollectionFragment[]> => {
    return logExecutionTime(
      () =>
        this.paginate(['creator', 'manager', 'minter'], {
          query: getCollectionsByAuthorizedUserQuery(),
          variables: {
            user: userAddress.toLowerCase(),
            users: [userAddress.toLowerCase()],
          },
        }),
      this.logger,
      'Collections by authorized user'
    )
  }

  fetchCollectionWithItem = async (contractAddress: string, itemId: string) => {
    const {
      data: { collections = [], items = [] },
    } = await this.query<{
      collections: CollectionFragment[]
      items: ItemFragment[]
    }>({
      query: getCollectionWithItemByIdsQuery(),
      variables: { id: contractAddress.toLowerCase(), itemId },
    })

    return {
      collection: collections.length > 0 ? collections[0] : null,
      item: items.length > 0 ? items[0] : null,
    }
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

  fetchItems = async (): Promise<ItemFragment[]> => {
    return logExecutionTime(
      () => this.paginate(['items'], { query: getItemsQuery() }),
      this.logger,
      'Items fetch'
    )
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
    } = await logExecutionTime(
      () =>
        this.query<{ items: ItemFragment[] }>({
          query: getItemsByCollectionIdQuery(),
          variables: { collectionId: contractAddress.toLowerCase() },
        }),
      this.logger,
      'Items by contract fetch'
    )

    return items
  }

  fetchItemsByAuthorizedUser = async (
    userAddress: string
  ): Promise<ItemFragment[]> => {
    const result: { items: ItemFragment[] }[] = await logExecutionTime(
      () =>
        this.paginate(['creator', 'manager', 'minter'], {
          query: getItemsByAuthorizedUserQuery(),
          variables: {
            user: userAddress.toLowerCase(),
            users: [userAddress.toLowerCase()],
          },
        }),
      this.logger,
      'Items by author fetch'
    )

    return result.reduce(
      (items, collection) => [...items, ...collection.items],
      [] as ItemFragment[]
    )
  }

  fetchCommittee = async (): Promise<AccountFragment[]> => {
    return logExecutionTime(
      () => this.paginate(['accounts'], { query: getCommitteeQuery() }),
      this.logger,
      'Committee fetch'
    )
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
