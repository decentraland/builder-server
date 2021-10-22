import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import { thirdPartyFragment, ThirdPartyFragment } from './fragments'
import {
  BaseGraphAPI,
  PAGINATION_VARIABLES,
  PAGINATION_ARGUMENTS,
} from './BaseGraphAPI'

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

export const THIRD_PARTY_URL = env.get('THIRD_PARTY_GRAPH_URL', '')

export class ThirdPartyAPI extends BaseGraphAPI {
  fetchThirdParties = async (
    manager: string = ''
  ): Promise<ThirdPartyFragment[]> => {
    return this.paginate(['thirdParties'], {
      query: getThirdPartiesQuery(manager),
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
}

export const thirdPartyAPI = new ThirdPartyAPI(THIRD_PARTY_URL)
