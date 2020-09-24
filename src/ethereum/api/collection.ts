import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import { CollectionAttributes } from '../../Collection'
import { createClient } from './client'

export const COLLECTIONS_URL = env.get('COLLECTIONS_GRAPH_URL', '')
const graphClient = createClient(COLLECTIONS_URL)

const getCollectionsQuery = () => gql`
  query getCollections($owner: String) {
    collections(where: { owner: $owner }) {
      id
      owner
      name
      isApproved
      minters
      managers
    }
  }
`

type RemoteItem = {
  id: string
}

type RemoteCollection = {
  id: string
  owner: string
  name: string
  isApproved: boolean
  minters: string[]
  managers: string[]
  items: RemoteItem[]
}

type CollectionsQueryResult = {
  collections: RemoteCollection[]
}

/*
Collection {
  id: ID!
  items: [Item!]
  owner: String!
  creator: String
  name: String!
  symbol: String!
  isCompleted: Boolean
  isApproved: Boolean
  isEditable: Boolean
  minters: [String!]
  managers: [String!]
}
 */
export class CollectionAPI {
  fetchCollectionsByOwner = async (owner: string) => {
    const { data } = await graphClient.query<CollectionsQueryResult>({
      query: getCollectionsQuery(),
      variables: { owner: owner.toLowerCase() }
    })

    return data.collections.map(this.fromRemoteCollection)
  }

  fromRemoteCollection(
    collection: RemoteCollection
  ): Partial<CollectionAttributes> {
    /*
      id: string // uuid
      name: string
      eth_address: string
      salt: string | null
      contract_address: string | null
      is_published: boolean
      created_at: Date
      updated_at: Date
     */
    return {
      name: collection.name,
      eth_address: collection.owner,
      contract_address: collection.id,
      is_published: collection.isApproved,
      minters: collection.minters,
      managers: collection.managers
    }
  }
}

export const collectionAPI = new CollectionAPI()
