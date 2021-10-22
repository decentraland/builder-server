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
const MANAGERS = env
  .get('TPW_MANAGER_ADDRESSES', '')
  .split(/[ ,]+/)
  .map((address) => address.toLowerCase())

const getThirdPartiesQuery = (manager: string = '') => gql`
  query getThirdParties(${PAGINATION_VARIABLES}, ) {
    thirdParties(${PAGINATION_ARGUMENTS}, where: { managers_contains: ["${manager}"], isApproved: true }) {
      ...thirdPartyFragment
    }
  }
  ${thirdPartyFragment()}
`

const getThirdPartyCollectionItemsQuery = () => gql`
  query getThirdPartyCollectionItems(${PAGINATION_VARIABLES}, $collectionId: String ) {
    thirdPartyItemsFragment(${PAGINATION_ARGUMENTS}, where: { "searchCollectionId" : $collectionId }) {
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
    collectionId: string
  ): Promise<ThirdPartyItemsFragment[]> => {
    return this.paginate(['thirdPartyItemsFragment'], {
      query: getThirdPartyCollectionItemsQuery(),
      variables: { collectionId },
    })
  }

  /**
   * Checks if an address manages a third party wearable collection.
   *
   * @param urn - The URN of the TWP collection where to get the information about the collection.
   * @param address - The address to check if it manages the collection.
   */
  isManager(_: string, address: string): Promise<boolean> {
    if (MANAGERS.includes(address.toLowerCase())) {
      return Promise.resolve(true)
    }
    return Promise.resolve(false)
  }
}

export const thirdPartyAPI = new ThirdPartyAPI(THIRD_PARTY_URL)
