import { Rarity } from '@dcl/schemas'
import { matchers } from '../common/matchers'
import {
  animationMetricsSchema,
  modelMetricsSchema,
} from '../Metrics/Metrics.schema'
import { emoteSchema } from './emote/types'
import { FullItem, ItemType } from './Item.types'
import { wearableSchema } from './wearable/types'

// The schema is placed into this file to avoid a circular dependency.
const baseItemSchema = Object.freeze({
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

export const itemSchema = Object.freeze({
  type: 'object',
  discriminator: { propertyName: 'type' },
  required: ['type'],
  oneOf: [
    {
      ...baseItemSchema,
      properties: {
        ...baseItemSchema.properties,
        type: { const: ItemType.WEARABLE },
        data: wearableSchema,
        metrics: modelMetricsSchema,
      },
    },
    {
      ...baseItemSchema,
      properties: {
        ...baseItemSchema.properties,
        type: { const: ItemType.EMOTE },
        data: emoteSchema,
        metrics: animationMetricsSchema,
      },
    },
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
