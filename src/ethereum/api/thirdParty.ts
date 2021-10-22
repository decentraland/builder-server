import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import {
  thirdPartyFragment,
  ThirdPartyFragment,
  ThirdPartyItemsFragment,
  thirdPartyItemFragment,
} from './fragments'
import {
  BaseGraphAPI,
  PAGINATION_VARIABLES,
  PAGINATION_ARGUMENTS,
} from './BaseGraphAPI'

export const THIRD_PARTY_URL = env.get('THIRD_PARTY_GRAPH_URL', '')

const getThirdPartiesQuery = (manager: string = '') => gql`
  query getThirdParties(${PAGINATION_VARIABLES}, ) {
    thirdParties(${PAGINATION_ARGUMENTS}, where: { managers_contains: ["${manager}"], isApproved: true }) {
      ...thirdPartyFragment
    }
  }
  ${thirdPartyFragment()}
`

const getThirdPartyCollectionItemsQuery = () => gql`
  query getThirdPartyCollectionItems(${PAGINATION_VARIABLES}, $collectionId: String, $thirdPartyId: String ) {
    thirdPartyItemsFragment(${PAGINATION_ARGUMENTS}, where: { "searchCollectionId" : $collectionId, "searchThirdPartyId": $thirdPartyId }) {
      ...thirdPartyItemsFragment
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
    return this.paginate(['thirdPartyItemsFragment'], {
      query: getThirdPartyCollectionItemsQuery(),
      variables: { thirdPartyId, collectionId },
    })
  }
}

export const thirdPartyAPI = new ThirdPartyAPI(THIRD_PARTY_URL)
