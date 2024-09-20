import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import {
  thirdPartyFragment,
  ThirdPartyFragment,
  thirdPartyItemFragment,
  ReceiptFragment,
  receiptsFragment,
} from './fragments'
import {
  BaseGraphAPI,
  PAGINATION_VARIABLES,
  PAGINATION_ARGUMENTS,
} from './BaseGraphAPI'

export const THIRD_PARTY_URL = env.get('THIRD_PARTY_GRAPH_URL', '')

const getThirdPartiesQuery = () => gql`
  query getThirdParties(${PAGINATION_VARIABLES}) {
    thirdParties(${PAGINATION_ARGUMENTS}) {
      ...thirdPartyFragment
    }
  }
  ${thirdPartyFragment()}
`
const getThirdPartyQuery = () => gql`
  query getThirdParty($id: String!) {
    thirdParties(first: 1, where: { id: $id }) {
      ...thirdPartyFragment
    }
  }
  ${thirdPartyFragment()}
`

const getThirdPartiesByManagerQuery = () => gql`
  query getThirdPartiesByManager(${PAGINATION_VARIABLES}, $managers: [String!]) {
    thirdParties(${PAGINATION_ARGUMENTS}, where: { managers_contains: $managers }) {
      ...thirdPartyFragment
    }
  }
  ${thirdPartyFragment()}
`

const getThirdPartyMaxItems = () => gql`
  query getThirdPartyAvailableSlots($thirdPartyId: String!) {
    thirdParties(where: { id: $thirdPartyId }) {
      maxItems
    }
  }
`

const isManagerQuery = () => gql`
  query isManager($thirdPartyId: String!, $managers: [String!]) {
    thirdParties(
      first: 1
      where: { id: $thirdPartyId, managers_contains: $managers }
    ) {
      id
    }
  }
  ${thirdPartyItemFragment()}
`

const getReceiptByIdQuery = () => gql`
  query getReceiptById($hash: String!) {
    receipts(first: 1, where: { id: $hash }) {
      ...receiptsFragment
    }
  }
  ${receiptsFragment()}
`

export class ThirdPartyAPI extends BaseGraphAPI {
  fetchThirdParties = async (): Promise<ThirdPartyFragment[]> => {
    return this.paginate(['thirdParties'], {
      query: getThirdPartiesQuery(),
      variables: {},
    })
  }

  fetchThirdParty = async (
    thirdPartyId: string
  ): Promise<ThirdPartyFragment | undefined> => {
    const {
      data: { thirdParties },
    } = await this.query<{ thirdParties: ThirdPartyFragment[] }>({
      query: getThirdPartyQuery(),
      variables: { id: thirdPartyId },
    })

    return thirdParties[0]
  }

  fetchThirdPartiesByManager = async (
    manager?: string
  ): Promise<ThirdPartyFragment[]> => {
    return this.paginate(['thirdParties'], {
      query: getThirdPartiesByManagerQuery(),
      variables: { managers: manager ? [manager.toLowerCase()] : [] },
    })
  }

  fetchReceiptById = async (
    hash: string
  ): Promise<ReceiptFragment | undefined> => {
    const {
      data: { receipts },
    } = await this.query<{ receipts: ReceiptFragment[] }>({
      query: getReceiptByIdQuery(),
      variables: { hash },
    })

    return receipts[0]
  }

  fetchMaxItemsByThirdParty = async (thirdPartyId: string): Promise<number> => {
    const {
      data: { thirdParties },
    } = await this.query<{
      thirdParties: { maxItems: string }[]
    }>({
      query: getThirdPartyMaxItems(),
      variables: { thirdPartyId },
    })
    return Number(thirdParties[0].maxItems)
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
