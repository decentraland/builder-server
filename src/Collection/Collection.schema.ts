import { ContractNetwork } from '@dcl/schemas'
import { matchers } from '../common/matchers'
import { TermsOfServiceEvent } from './Collection.types'

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
    linked_contract_address: { type: ['string', 'null'] },
    linked_contract_network: {
      type: ['string', 'null'],
      enum: [...Object.values(ContractNetwork), null],
    },
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
    collection_address: { type: 'string' },
    event: {
      type: 'string',
      enum: [
        TermsOfServiceEvent.PUBLISH_COLLECTION,
        TermsOfServiceEvent.PUBLISH_THIRD_PARTY_ITEMS,
      ],
    },
    hashes: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 40000,
    },
  },
  required: ['email'],
  additionalProperties: false,
})
