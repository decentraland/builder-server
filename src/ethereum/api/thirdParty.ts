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
  query getThirdParties(${PAGINATION_VARIABLES}, $managers: [String!]) {
    thirdParties(${PAGINATION_ARGUMENTS}, where: { managers_contains: $managers, isApproved: true }) {
      ...thirdPartyFragment
    }
  }
  ${thirdPartyFragment()}
`

const getThirdPartyIdsQuery = () => gql`
  query getThirdPartyIds(${PAGINATION_VARIABLES}, $managers: [String!]) {
    thirdParties(${PAGINATION_ARGUMENTS}, where: { managers_contains: $managers, isApproved: true }) {
      id
    }
  }
`

const getThirdPartyItemQuery = () => gql`
  query getThirdPartyItem($urn: String) {
    items(first: 1, where: { urn: $urn }) {
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
      where: { thirdParty: $thirdPartyId, searchCollectionId: $collectionId } # orderBy: createdAt # orderDirection: desc
    ) {
      id
    }
  }
`

const isManagerQuery = () => gql`
  query isManager($urn: String!, $managers: [String!]) {
    thirdParties(
      first: 1
      where: { id: $urn, managers_contains: $managers, isApproved: true }
    ) {
      id
    }
  }
`

const getThirdPartyItemsQuery = () => gql`
  query getThirdPartyItems {
    items {
      ...thirdPartyItemFragment
    }
  }
  ${thirdPartyItemFragment()}
`

export class ThirdPartyAPI extends BaseGraphAPI {
  fetchThirdParties = async (
    manager?: string
  ): Promise<ThirdPartyFragment[]> => {
    return this.paginate(['thirdParties'], {
      query: getThirdPartiesQuery(),
      variables: { managers: manager ? [manager.toLowerCase()] : [] },
    })
  }

  fetchThirdPartyIds = async (manager: string = ''): Promise<string[]> => {
    const thirdParties = await this.paginate<IdFragment, 'thirdParties'>(
      ['thirdParties'],
      {
        query: getThirdPartyIdsQuery(),
        variables: { managers: [manager.toLowerCase()] },
      }
    )
    return thirdParties.map((thirdParty) => thirdParty.id)
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
      query: getThirdPartyItemsQuery(),
      variables: { thirdPartyIds },
    })
  }

  fetchItems = async (): Promise<ThirdPartyItemFragment[]> => {
    return this.paginate(['items'], {
      query: getThirdPartyItemsQuery(),
    })
  }

  fetchItem = async (urn: string): Promise<ThirdPartyItemFragment | null> => {
    const {
      data: { items = [] },
    } = await this.query<{
      items: ThirdPartyItemFragment[]
    }>({
      query: getThirdPartyItemQuery(),
      variables: { urn },
    })

    return items.length > 0 ? items[0] : null
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

  isPublished = async (thirdPartyId: string, collectionId: string) => {
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

  isManager = async (urn: string, manager: string): Promise<boolean> => {
    const {
      data: { thirdParties = [] },
    } = await this.query<{
      thirdParties: IdFragment[]
    }>({
      query: isManagerQuery(),
      variables: { urn, managers: [manager.toLowerCase()] },
    })
    return thirdParties.length > 0
  }
}

export const thirdPartyAPI = new ThirdPartyAPI(THIRD_PARTY_URL)
