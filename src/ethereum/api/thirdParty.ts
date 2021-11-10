import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import {
  thirdPartyFragment,
  ThirdPartyFragment,
  ThirdPartyItemsFragment,
  thirdPartyItemFragment,
  tiersFragment,
  TierFragment,
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

const getThirdPartyQuery = () => gql`
  query getThirdParty($urn: String!, $managers: [String!]) {
    thirdParties(
      first: 1
      where: { id: $urn, managers_contains: $managers, isApproved: true }
    ) {
      ...thirdPartyFragment
    }
  }
  ${thirdPartyFragment()}
`

const getTiersQuery = () => gql`
  query getTiersQuery {
    tiers {
      ...tiersFragment
    }
  }
  ${tiersFragment()}
`

const getThirdPartyCollectionItemsQuery = () => gql`
  query getThirdPartyCollectionItems(${PAGINATION_VARIABLES}, $collectionId: String, $thirdPartyId: String) {
    items(${PAGINATION_ARGUMENTS}, where: { searchCollectionId : $collectionId, searchThirdPartyId: $thirdPartyId }) {
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

  fetchThirdPartyCollectionItems = async (
    thirdPartyId: string,
    collectionId: string
  ): Promise<ThirdPartyItemsFragment[]> => {
    return this.paginate(['items'], {
      query: getThirdPartyCollectionItemsQuery(),
      variables: { thirdPartyId, collectionId },
    })
  }

  fetchThirdPartyIds = async (manager: string = ''): Promise<string[]> => {
    const thirdParties = await this.paginate<{ id: string }, 'thirdParties'>(
      ['thirdParties'],
      {
        query: getThirdPartyIdsQuery(),
        variables: { managers: [manager.toLowerCase()] },
      }
    )
    return thirdParties.map((thirdParty) => thirdParty.id)
  }

  isManager = async (urn: string, manager: string): Promise<boolean> => {
    const {
      data: { thirdParties = [] },
    } = await this.query<{
      thirdParties: ThirdPartyFragment[]
    }>({
      query: getThirdPartyQuery(),
      variables: { urn, managers: [manager.toLowerCase()] },
    })
    return thirdParties.length > 0
  }

  fetchTiers = (): Promise<TierFragment[]> => {
    return this.paginate(['tiers'], {
      query: getTiersQuery(),
    })
  }
}

export const thirdPartyAPI = new ThirdPartyAPI(THIRD_PARTY_URL)
