import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import { CollectionItem } from '../../Item'
import {
  collectionFragment,
  collectionFields,
  itemFields,
  CollectionFields,
  CollectionFragment,
  ItemFragment
} from './fragments'
import { createClient } from './client'
import { Bridge } from './Bridge'

export const COLLECTIONS_URL = env.get('COLLECTIONS_GRAPH_URL', '')
const graphClient = createClient(COLLECTIONS_URL)

export class CollectionAPI {
  bridge: Bridge

  constructor() {
    this.bridge = new Bridge()
  }

  fetchCollectionWithItemsById = async (id: string) => {
    const { data } = await graphClient.query<{
      collections: CollectionFragment[]
    }>({
      query: getCollectionWithItems(),
      variables: { id: id.toLowerCase() }
    })
    const remoteCollection = data.collections[0]

    return {
      collection: this.bridge.fromRemoteCollection(remoteCollection),
      items: this.extractItems([remoteCollection])
    }
  }

  fetchCollectionsByOwner = async (owner: string) => {
    const { data } = await graphClient.query<{
      collections: CollectionFields[]
    }>({
      query: getCollectionsByCreatorQuery(),
      variables: { creator: owner.toLowerCase() }
    })

    return data.collections.map(this.bridge.fromRemoteCollection)
  }

  fetchCollectionsWithItemsByOwner = async (owner: string) => {
    const { data } = await graphClient.query<{
      collections: CollectionFragment[]
    }>({
      query: getCollectionsWithItemsByCreatorQuery(),
      variables: { creator: owner.toLowerCase() }
    })

    return {
      collections: data.collections.map(this.bridge.fromRemoteCollection),
      items: this.extractItems(data.collections)
    }
  }

  fetchItemByBlockchainId = async (blockchainId: string) => {
    const { data } = await graphClient.query<{ items: ItemFragment[] }>({
      query: getItem(),
      variables: { blockchainId }
    })

    return data.items.length > 0
      ? this.bridge.fromRemoteItem(data.items[0])
      : undefined
  }

  private extractItems(collections: CollectionFragment[]) {
    let items: Partial<CollectionItem>[] = []

    for (const collection of collections) {
      for (const collectionItem of collection.items) {
        const item = this.bridge.fromRemoteItem({
          ...collectionItem,
          collection
        })

        items.push({
          ...item,
          collection: this.bridge.fromRemoteCollection(collection)!
        })
      }
    }

    return items
  }
}

export const collectionAPI = new CollectionAPI()

const getCollectionWithItems = () => gql`
  query getCollectionWithItems($id: String) {
    collections(where: { id: $id }) {
      ...collectionFragment
    }
  }
  ${collectionFragment()}
`

const getCollectionsByCreatorQuery = () => gql`
  query getCollectionsByCreator($creator: String) {
    collections(where: { creator: $creator }) {
      ...collectionFields
    }
  }
  ${collectionFields()}
`

const getCollectionsWithItemsByCreatorQuery = () => gql`
  query getCollectionsWithItemsByCreatorQuery($creator: String) {
    collections(where: { creator: $creator }) {
      ...collectionFragment
    }
  }
  ${collectionFragment()}
`

const getItem = () => gql`
  query getItem($blockchainId: String) {
    items(where: { blockchainId: $blockchainId }) {
      ...itemFields
    }
  }
  ${itemFields()}
`
