export type CollectionAttributes = {
  id: string // uuid
  name: string
  eth_address: string
  salt: string | null
  contract_address: string | null
  is_published: boolean
  minters: string[]
  managers: string[]
  created_at: Date
  updated_at: Date
}

export const collectionSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    eth_address: { type: 'string' },
    salt: { type: ['string', 'null'] },
    contract_address: { type: ['string', 'null'] },
    is_published: { type: 'boolean' },
    minters: {
      type: 'array',
      items: {
        type: { type: 'string' }
      }
    },
    managers: {
      type: 'array',
      items: {
        type: { type: 'string' }
      }
    },
    created_at: { type: 'string' },
    updated_at: { type: 'string' }
  },
  additionalProperties: false,
  removeAdditional: true,
  required: [
    'id',
    'name',
    'eth_address',
    'salt',
    'contract_address',
    'is_published',
    'created_at',
    'updated_at'
  ]
})
