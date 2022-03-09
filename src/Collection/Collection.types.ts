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

export type Cheque = {
  signedMessage: string
  signature: string
  qty: number
  salt: string
}
