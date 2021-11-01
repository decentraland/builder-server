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

const getThirdPartiesQuery = (manager: string = '') => gql`
  query getThirdParties(${PAGINATION_VARIABLES}) {
    thirdParties(${PAGINATION_ARGUMENTS}, where: { managers_contains: ["${manager}"], isApproved: true }) {
      ...thirdPartyFragment
    }
  }
  ${thirdPartyFragment()}
`

const getThirdPartyQuery = (urn: string, manager: string) => gql`
  query getThirdPartyQuery {
    thirdParties(first: 1, where: { id: "${urn}", managers_contains: ["${manager}"], isApproved: true }) {
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
    manager: string = ''
  ): Promise<ThirdPartyFragment[]> => {
    return this.paginate(['thirdParties'], {
      query: getThirdPartiesQuery(manager),
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

  isManager = async (urn: string, manager: string): Promise<boolean> => {
    const {
      data: { thirdParties = [] },
    } = await this.query<{
      thirdParties: ThirdPartyFragment[]
    }>({
      query: getThirdPartyQuery(urn, manager),
      variables: { urn, manager: manager.toLowerCase() },
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
