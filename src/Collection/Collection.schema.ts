import { matchers } from '../common/matchers'

export const collectionSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    urn: { type: ['string', 'null'], pattern: matchers.urn },
    name: { type: 'string', maxLength: 42 },
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
    forum_id: { type: ['integer', 'null'] },
    reviewed_at: { type: ['string', 'null'] },
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
  ],
})

export const upsertCollectionSchema = Object.freeze({
  type: 'object',
  properties: {
    collection: collectionSchema,
    data: { type: 'string' },
  },
  additionalProperties: false,
  required: ['collection'],
})

export const saveTOSSchema = Object.freeze({
  type: 'object',
  properties: {
    email: {
      type: 'string',
      pattern: `^${matchers.email}$`,
    },
    collection_address: { type: 'string', pattern: `^${matchers.address}$` },
  },
  additionalProperties: false,
  required: ['email', 'collection_address'],
})
