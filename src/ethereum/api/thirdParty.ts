import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import {
  thirdPartyFragment,
  ThirdPartyFragment,
  ThirdPartyItemFragment,
  thirdPartyItemFragment,
  tiersFragment,
  TierFragment,
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

const getItemsQuery = () => gql`
  query getItems {
    items {
      ...thirdPartyItemFragment
    }
  }
  ${thirdPartyItemFragment()}
`

const getItemsByThirdPartyIdsQuery = () => gql`
  query getItemsByThirdPartyIds(${PAGINATION_VARIABLES}, $thirdPartiesIds: [String!]) {
    items(${PAGINATION_ARGUMENTS}, where: { thirdParty_in: $thirdPartiesIds }) {
      ...thirdPartyItemFragment
    }
  }
  ${thirdPartyItemFragment()}
`

const getThirdPartyMaxItems = () => gql`
  query getThirdPartyAvailableSlots($thirdPartyId: String!) {
    thirdParties(where: { id: $thirdPartyId }) {
      maxItems
    }
  }
`

const getItemsByCollectionQuery = () => gql`
  query getItemsByCollection(${PAGINATION_VARIABLES}, $thirdPartiesId: String!, $collectionId: String!) {
    items(${PAGINATION_ARGUMENTS}, where: { thirdParty: $thirdPartiesId, searchCollectionId: $collectionId }) {
      ...thirdPartyItemFragment
    }
  }
  ${thirdPartyFragment()}
`

const getItemQuery = () => gql`
  query getThirdPartyItem($urn: String) {
    items(first: 1, where: { urn: $urn }) {
      ...thirdPartyItemFragment
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

const getTiersQuery = () => gql`
  query getTiersQuery {
    tiers {
      ...tiersFragment
    }
  }
  ${tiersFragment()}
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

  fetchItems = async (): Promise<ThirdPartyItemFragment[]> => {
    return this.paginate(['items'], {
      query: getItemsQuery(),
    })
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
