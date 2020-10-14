import gql from 'graphql-tag'
import { env } from 'decentraland-commons'
import { CollectionAttributes } from '../../Collection'
import { ItemAttributes, CollectionItemAttributes } from '../../Item'
import {
  collectionFragment,
  collectionFields,
  itemFields,
  CollectionFields,
  CollectionFragment,
  ItemFragment
} from './fragments'
import { createClient } from './client'

export const COLLECTIONS_URL = env.get('COLLECTIONS_GRAPH_URL', '')
const graphClient = createClient(COLLECTIONS_URL)

export class CollectionAPI {
  fetchCollectionById = async (id: string) => {
    const { data } = await graphClient.query<{
      collections: CollectionFields[]
    }>({
      query: getCollection(),
      variables: { id: id.toLowerCase() }
    })

    return data.collections.length > 0
      ? this.fromRemoteCollection(data.collections[0])
      : undefined
  }

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
      query: getCollectionsAndItemsByCreatorQuery(),
      variables: { creator: owner.toLowerCase() }
    })

    const collections: Partial<CollectionAttributes>[] = data.collections.map(
      this.fromRemoteCollection
    )
    let items: Partial<CollectionItemAttributes>[] = this.extractItems(
      data.collections
    )

    return { collections, items }
  }

  fetchItemByBlockchainId = async (blockchainId: string) => {
    const { data } = await graphClient.query<{ items: ItemFragment[] }>({
      query: getItem(),
      variables: { blockchainId }
    })

    return data.items.length > 0
      ? this.fromRemoteItem(data.items[0])
      : undefined
  }

  private extractItems(collections: CollectionFragment[]) {
    let items: Partial<CollectionItemAttributes>[] = []

    for (const collection of collections) {
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

    return items
  }

  private fromRemoteCollection(
    collection: CollectionFragment | CollectionFields
  ): Partial<CollectionAttributes> {
    return {
      name: collection.name,
      eth_address: collection.creator,
      contract_address: collection.id,
      is_published: true,
      is_approved: collection.isApproved,
      minters: collection.minters,
      managers: collection.managers
    }
  }

  private fromRemoteItem(item: ItemFragment): Partial<ItemAttributes> {
    return {
      price: item.price,
      beneficiary: item.beneficiary,
      blockchain_item_id: item.blockchainId,
      is_published: true,
      is_approved: item.collection.isApproved,
      total_supply: Number(item.totalSupply)
    }
  }
}

export const collectionAPI = new CollectionAPI()

const getCollection = () => gql`
  query getCollection($id: String) {
    collections(where: { id: $id }) {
      ...collectionFields
    }
  }
  ${collectionFields()}
`

const getCollectionsByCreatorQuery = () => gql`
  query getCollectionsByCreator($creator: String) {
    collections(where: { creator: $creator }) {
      ...collectionFields
    }
  }
  ${collectionFields()}
`

const getCollectionsAndItemsByCreatorQuery = () => gql`
  query getCollectionsAndItemsByCreatorQuery($creator: String) {
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
