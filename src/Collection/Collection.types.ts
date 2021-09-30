export type CollectionAttributes = {
  id: string // uuid
  /**
   * The urn field holds the collection part of the URN in third party collections.
   * All Decentraland collections will contain this column as null but it will be generated and returned
   * whenever a Decentraland collection is requested.
   */
  urn: string | null
  name: string
  eth_address: string
  salt: string
  contract_address: string
  is_published: boolean
  is_approved: boolean
  minters: string[]
  managers: string[]
  forum_link?: string
  lock: Date
  reviewed_at: Date
  created_at: Date
  updated_at: Date
}

export const collectionSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    urn: { type: ['string'] },
    name: { type: 'string', maxLength: 32 },
    eth_address: { type: 'string' },
    salt: { type: ['string', 'null'] },
    contract_address: { type: ['string', 'null'] },
    is_published: { type: 'boolean' },
    is_approved: { type: 'boolean' },
    minters: {
      type: 'array',
      items: { type: 'string' },
    },
    managers: {
      type: 'array',
      items: { type: 'string' },
    },
    forum_link: { type: ['string', 'null'] },
    reviewed_at: { type: 'string' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
  additionalProperties: false,
  required: [
    'id',
    'name',
    'eth_address',
    'salt',
    'contract_address',
    'reviewed_at',
    'created_at',
    'updated_at',
  ],
})

export const saveTOSSchema = Object.freeze({
  type: 'object',
  properties: {
    email: {
      type: 'string',
      // prettier-ignore
      pattern: "^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$",
    },
    collection_address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
  },
  additionalProperties: false,
  required: ['email', 'collection_address'],
})
