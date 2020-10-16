import { ItemAttributes } from '../Item'

export type CollectionAttributes = {
  id: string // uuid
  name: string
  eth_address: string
  salt: string
  contract_address: string
  is_published: boolean
  is_approved: boolean
  minters: string[]
  managers: string[]
  created_at: Date
  updated_at: Date
}

export type CollectionWithItems = CollectionAttributes & {
  items: ItemAttributes[]
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
    is_approved: { type: 'boolean' },
    minters: {
      type: 'array',
      items: { type: 'string' }
    },
    managers: {
      type: 'array',
      items: { type: 'string' }
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
    'created_at',
    'updated_at'
  ]
})
