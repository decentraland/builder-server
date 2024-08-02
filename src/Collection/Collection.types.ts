import { ItemCurationAttributes } from '../Curation/ItemCuration'
import { FullItem } from '../Item'

export type CollectionAttributes = {
  id: string // uuid
  /**
   * The urn_suffix field holds the collection part of the URN in third party collections.
   * All Decentraland collections will contain this column as null but it will be generated and returned
   * whenever a Decentraland collection is requested.
   */
  name: string
  eth_address: string
  salt: string | null
  contract_address: string | null
  urn_suffix: string | null
  third_party_id: string | null
  is_published: boolean
  is_approved: boolean
  minters: string[]
  managers: string[]
  forum_link: string | null
  forum_id: number | null
  lock: Date | null
  reviewed_at: Date | null
  created_at: Date
  updated_at: Date
}

export enum TermsOfServiceEvent {
  PUBLISH_COLLECTION = 'publish_collection_tos',
  PUBLISH_THIRD_PARTY_ITEMS = 'publish_third_party_items_tos',
}

export type ThirdPartyCollectionAttributes = CollectionAttributes & {
  third_party_id: string
  urn_suffix: string
}

export type FullCollection = Omit<
  CollectionAttributes,
  'urn_suffix' | 'third_party_id'
> & {
  urn: string | null
}

export type PublishCollectionResponse<T> = {
  collection: T
  items: FullItem[]
  itemCurations?: ItemCurationAttributes[]
}

export enum CollectionTypeFilter {
  STANDARD = 'standard',
  THIRD_PARTY = 'third_party',
}

export enum CollectionSort {
  MOST_RELEVANT = 'MOST_RELEVANT',
  CREATED_AT_DESC = 'CREATED_AT_DESC',
  CREATED_AT_ASC = 'CREATED_AT_ASC',
  NAME_DESC = 'NAME_DESC',
  NAME_ASC = 'NAME_ASC',
  UPDATED_AT_DESC = 'UPDATED_AT_DESC',
  UPDATED_AT_ASC = 'UPDATED_AT_ASC',
}
