export type CurationAttributes = {
  id: string // uuid
  name: string
  eth_address: string
  salt: string
  contract_address: string
  is_published: boolean
  is_approved: boolean
  minters: string[]
  managers: string[]
  forum_link?: string
  reviewed_at: Date
  created_at: Date
  updated_at: Date
}

export const curationSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
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
