import { Rarity } from '@dcl/schemas'
import { matchers } from '../common/matchers'
import { metricsSchema } from '../Metrics/Metrics.schema'
import { emoteSchema } from './emote/types'
import { FullItem, ItemType } from './Item.types'
import { wearableSchema } from './wearable/types'

// The schema is placed into this file to avoid a circular dependency.
export const itemSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    urn: { type: ['string', 'null'], pattern: matchers.urn },
    name: { type: 'string', maxLength: 32, pattern: '^[^:]*$' },
    description: {
      type: ['string', 'null'],
      maxLength: 64,
      pattern: '^[^:]*$',
    },
    thumbnail: { type: 'string' },
    eth_address: { type: 'string' },
    collection_id: { type: ['string', 'null'], format: 'uuid' },
    blockchain_item_id: { type: ['string', 'null'] },
    price: { type: ['string', 'null'] },
    beneficiary: { type: ['string', 'null'] },
    rarity: {
      type: ['string', 'null'],
      enum: [...Rarity.schema.enum, null],
    },
    total_supply: { type: 'number', minimum: 0 },
    is_published: { type: 'boolean' },
    is_approved: { type: 'boolean' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    type: { enum: Object.values(ItemType) },
    data: { type: 'object', anyOf: [wearableSchema, emoteSchema] },
    metrics: metricsSchema,
    contents: {
      type: 'object',
      additionalProperties: true,
    },
    content_hash: { type: ['string', 'null'] },
  },
  additionalProperties: false,
  anyOf: [{ required: ['id'] }, { required: ['urn'] }],
  required: [
    'name',
    'description',
    'eth_address',
    'data',
    'type',
    'metrics',
    'contents',
  ],
})

export const upsertItemSchema = Object.freeze({
  type: 'object',
  properties: {
    item: itemSchema,
  },
  additionalProperties: false,
  required: ['item'],
})

export function areItemRepresentationsValid(item: FullItem): boolean {
  const contentFiles = Object.keys(item.contents)
  return item.data.representations.every(
    (representation) =>
      representation.contents.includes(representation.mainFile) &&
      representation.contents.every((file) => contentFiles.includes(file))
  )
}
