import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import { thirdPartyFragment, ThirdPartyFragment } from './fragments'
import {
  BaseGraphAPI,
  PAGINATION_VARIABLES,
  PAGINATION_ARGUMENTS,
} from './BaseGraphAPI'

const getThirdPartiesQuery = () => gql`
  query getThirdParties(${PAGINATION_VARIABLES}) {
    thirdParties(${PAGINATION_ARGUMENTS}) {
      ...thirdPartyFragment
    }
  }
  ${thirdPartyFragment()}
`

export const THIRD_PARTY_URL = env.get('THIRD_PARTY_GRAPH_URL', '')

export class ThirdPartyAPI extends BaseGraphAPI {
  fetchThirdParties = async (): Promise<ThirdPartyFragment[]> => {
    return this.paginate(['thirdParties'], {
      query: getThirdPartiesQuery(),
    })
  }
}

export const thirdPartyAPI = new ThirdPartyAPI(THIRD_PARTY_URL)
