import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import {
  thirdPartyFragment,
  ThirdPartyFragment,
  ThirdPartyItemFragment,
  thirdPartyItemFragment,
  tiersFragment,
  TierFragment,
  IdFragment,
} from './fragments'
import {
  BaseGraphAPI,
  PAGINATION_VARIABLES,
  PAGINATION_ARGUMENTS,
} from './BaseGraphAPI'

export const THIRD_PARTY_URL = env.get('THIRD_PARTY_GRAPH_URL', '')

const getThirdPartiesQuery = () => gql`
  query getThirdParties(${PAGINATION_VARIABLES}) {
    thirdParties(${PAGINATION_ARGUMENTS}, where: { isApproved: true }) {
      ...thirdPartyFragment
    }
  }
  ${thirdPartyFragment()}
`

const getThirdPartiesByManagerQuery = () => gql`
  query getThirdPartiesByManager(${PAGINATION_VARIABLES}, $managers: [String!]) {
    thirdParties(${PAGINATION_ARGUMENTS}, where: { managers_contains: $managers, isApproved: true }) {
      ...thirdPartyFragment
    }
  }
  ${thirdPartyFragment()}
`

const getItemsQuery = () => gql`
  query getItems {
    items {
      ...thirdPartyItemFragment
    }
  }
  ${thirdPartyItemFragment()}
`

const getItemsByThirdPartyIdsQuery = () => gql`
  query getItemsByThirdPartyIds(${PAGINATION_VARIABLES}, $thirdPartiesIds: [String!])) {
    items(${PAGINATION_ARGUMENTS}, where: { thirdParty_in: $thirdPartiesIds }) {
      ...thirdPartyItemFragment
    }
  }
  ${thirdPartyItemFragment()}
`

const getItemsByCollectionQuery = () => gql`
  query getItemsByCollection(${PAGINATION_VARIABLES}, $thirdPartiesId: String!, $collectionId: String!)) {
    items(${PAGINATION_ARGUMENTS}, where: { thirdParty: $thirdPartiesId, searchCollectionId: $collectionId }) {
      ...thirdPartyItemFragment
    }
  }
  ${thirdPartyItemFragment()}
`

const getItemQuery = () => gql`
  query getThirdPartyItem($urn: String) {
    items(first: 1, where: { urn: $urn }) {
      ...thirdPartyItemFragment
    }
  }
  ${thirdPartyItemFragment()}
`

const getLastReviewedItemQuery = () => gql`
  query getLastItem($thirdPartyId: String, $collectionId: String) {
    items(
      first: 1
      where: { thirdParty: $thirdPartyId, searchCollectionId: $collectionId }
      orderBy: reviewedAt
      orderDirection: desc
    ) {
      ...thirdPartyItemFragment
    }
  }
  ${thirdPartyItemFragment()}
`

const getTiersQuery = () => gql`
  query getTiersQuery {
    tiers {
      ...tiersFragment
    }
  }
  ${tiersFragment()}
`

const itemExistsQuery = () => gql`
  query getThirdPartyItem($urn: String) {
    items(first: 1, where: { urn: $urn }) {
      id
    }
  }
`

const isPublishedQuery = () => gql`
  query isPublished($thirdPartyId: String, $collectionId: String) {
    items(
      first: 1
      where: { thirdParty: $thirdPartyId, searchCollectionId: $collectionId }
    ) {
      id
    }
  }
`

const isManagerQuery = () => gql`
  query isManager($thirdPartyId: String!, $managers: [String!]) {
    thirdParties(
      first: 1
      where: {
        id: $thirdPartyId
        managers_contains: $managers
        isApproved: true
      }
    ) {
      ...thirdPartyFragment
    }
  }
  ${thirdPartyFragment()}
`

export class ThirdPartyAPI extends BaseGraphAPI {
  fetchThirdParties = async (): Promise<ThirdPartyFragment[]> => {
    return this.paginate(['thirdParties'], {
      query: getThirdPartiesQuery(),
      variables: {},
    })
  }

  fetchThirdPartiesByManager = async (
    manager?: string
  ): Promise<ThirdPartyFragment[]> => {
    return this.paginate(['thirdParties'], {
      query: getThirdPartiesByManagerQuery(),
      variables: { managers: manager ? [manager.toLowerCase()] : [] },
    })
  }

  fetchTiers = (): Promise<TierFragment[]> => {
    return this.paginate(['tiers'], {
      query: getTiersQuery(),
    })
  }

  fetchItemsByThirdParties = async (
    thirdPartyIds: string[]
  ): Promise<ThirdPartyItemFragment[]> => {
    return this.paginate(['items'], {
      query: getItemsByThirdPartyIdsQuery(),
      variables: { thirdPartyIds },
    })
  }

  fetchItemsByCollection = async (
    thirdPartyId: string,
    collectionId: string
  ): Promise<ThirdPartyItemFragment[]> => {
    return this.paginate(['items'], {
      query: getItemsByCollectionQuery(),
      variables: { thirdPartyId, collectionId },
    })
  }

  fetchItems = async (): Promise<ThirdPartyItemFragment[]> => {
    return this.paginate(['items'], {
      query: getItemsQuery(),
    })
  }

  fetchLastItem = async (
    thirdPartyId: string,
    collectionId: string
  ): Promise<ThirdPartyItemFragment | undefined> => {
    const {
      data: { items = [] },
    } = await this.query<{
      items: ThirdPartyItemFragment[]
    }>({
      query: getLastReviewedItemQuery(),
      variables: { thirdPartyId, collectionId },
    })

    return items[0]
  }

  fetchItem = async (
    urn: string
  ): Promise<ThirdPartyItemFragment | undefined> => {
    const {
      data: { items = [] },
    } = await this.query<{
      items: ThirdPartyItemFragment[]
    }>({
      query: getItemQuery(),
      variables: { urn },
    })

    return items[0]
  }

  itemExists = async (urn: string): Promise<boolean> => {
    const {
      data: { items = [] },
    } = await this.query<{
      items: IdFragment[]
    }>({
      query: itemExistsQuery(),
      variables: { urn },
    })

    return items.length > 0
  }

  isPublished = async (
    thirdPartyId: string,
    collectionId: string
  ): Promise<boolean> => {
    const {
      data: { items = [] },
    } = await this.query<{
      items: IdFragment[]
    }>({
      query: isPublishedQuery(),
      variables: { thirdPartyId, collectionId },
    })
    return items.length > 0
  }

  isManager = async (
    thirdPartyId: string,
    manager: string
  ): Promise<boolean> => {
    const {
      data: { thirdParties = [] },
    } = await this.query<{
      thirdParties: ThirdPartyFragment[]
    }>({
      query: isManagerQuery(),
      variables: {
        thirdPartyId,
        managers: [manager.toLowerCase()],
      },
    })
    return thirdParties.length > 0
  }
}

export const thirdPartyAPI = new ThirdPartyAPI(THIRD_PARTY_URL)
