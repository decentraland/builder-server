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
