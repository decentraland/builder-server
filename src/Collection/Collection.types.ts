export type CollectionAttributes = {
  id: string // uuid
  name: string
  eth_address: string
  salt?: string
  contract_address?: string
  is_published: boolean
  created_at: Date
  updated_at: Date
}

export const collectionSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    eth_address: { type: 'string' },
    salt: { type: 'string' },
    contract_address: { type: 'string' },
    is_published: { type: 'boolean' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' }
  },
  additionalProperties: false,
  removeAdditional: true,
  required: [
    'id',
    'name',
    'eth_address',
    'is_published',
    'created_at',
    'updated_at'
  ]
})
