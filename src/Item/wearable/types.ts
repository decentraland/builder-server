import { WearableCategory, BodyShape } from '@dcl/schemas'

export type WearableRepresentation = {
  bodyShapes: BodyShape[]
  mainFile: string
  contents: string[]
  overrideReplaces: WearableCategory[]
  overrideHides: WearableCategory[]
}

export type WearableData = {
  category?: WearableCategory
  representations: WearableRepresentation[]
  replaces: WearableCategory[]
  hides: WearableCategory[]
  tags: string[]
}

export const wearableSchema = Object.freeze({
  type: 'object',
  properties: {
    category: WearableCategory.schema,
    representations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          bodyShapes: {
            type: 'array',
            items: { enum: Object.values(BodyShape.schema.enum) },
          },
          mainFile: { type: 'string' },
          contents: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
          overrideReplaces: {
            type: 'array',
            items: WearableCategory.schema,
          },
          overrideHides: {
            type: 'array',
            items: WearableCategory.schema,
          },
        },
        additionalProperties: false,
        required: [
          'bodyShapes',
          'mainFile',
          'contents',
          'overrideReplaces',
          'overrideHides',
        ],
      },
      minItems: 1,
    },
    replaces: {
      type: 'array',
      items: WearableCategory.schema,
    },
    hides: {
      type: 'array',
      items: WearableCategory.schema,
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: false,
  required: ['representations', 'replaces', 'hides', 'tags'],
})
