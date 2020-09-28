import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import { CollectionAttributes } from '../../Collection'
import { ItemAttributes, CollectionItemAttributes } from '../../Item'
import {
  collectionFragment,
  collectionFields,
  CollectionFields,
  CollectionFragment,
  ItemFragment
} from './fragments'
import { createClient } from './client'

export const COLLECTIONS_URL = env.get('COLLECTIONS_GRAPH_URL', '')
const graphClient = createClient(COLLECTIONS_URL)

const getCollectionsByCreatorQuery = () => gql`
  query getCollectionsByCreator($creator: String) {
    collections(where: { creator: $creator }) {
      ...collectionFields
    }
  }
  ${collectionFields()}
`

const getCollectionsByAndItemsCreatorQuery = () => gql`
  query getCollectionsByAndItemsCreatorQuery($creator: String) {
    collections(where: { creator: $creator }) {
      ...collectionFragment
    }
  }
  ${collectionFragment()}
`

export class CollectionAPI {
  fetchCollectionsByOwner = async (owner: string) => {
    const { data } = await graphClient.query<{
      collections: CollectionFields[]
    }>({
      query: getCollectionsByCreatorQuery(),
      variables: { creator: owner.toLowerCase() }
    })

    return data.collections.map(this.fromRemoteCollection)
  }

  fetchCollectionsAndItemsByOwner = async (owner: string) => {
    const { data } = await graphClient.query<{
      collections: CollectionFragment[]
    }>({
      query: getCollectionsByAndItemsCreatorQuery(),
      variables: { creator: owner.toLowerCase() }
    })

    const collections: Partial<CollectionAttributes>[] = data.collections.map(
      this.fromRemoteCollection
    )
    let items: Partial<CollectionItemAttributes>[] = []

    for (const collection of data.collections) {
      for (const collectionItem of collection.items) {
        const item = this.fromRemoteItem({
          ...collectionItem,
          collection
        })

        items.push({
          ...item,
          collection: this.fromRemoteCollection(collection)!
        })
      }
    }

    return { collections, items }
  }

  private fromRemoteCollection(
    collection: CollectionFragment | CollectionFields
  ): Partial<CollectionAttributes> {
    return {
      name: collection.name,
      eth_address: collection.creator,
      contract_address: collection.id,
      is_published: true,
      is_approved: true || collection.isApproved, // TODO: remove true
      minters: collection.minters,
      managers: collection.managers
    }
  }

  private fromRemoteItem(item: ItemFragment): Partial<ItemAttributes> {
    return {
      blockchain_item_id: item.blockchainId,
      is_published: true,
      is_approved: item.collection.isApproved
    }
  }
}

export const collectionAPI = new CollectionAPI()
