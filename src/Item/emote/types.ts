import { BodyShape, EmoteCategory } from '@dcl/schemas'

export type EmoteRepresentation = {
  bodyShapes: BodyShape[]
  mainFile: string
  contents: string[]
}

export type EmoteData = {
  category: EmoteCategory
  representations: EmoteRepresentation[]
  tags: string[]
}

export const emoteSchema = Object.freeze({
  type: 'object',
  properties: {
    category: { enum: Object.values(EmoteCategory.schema.enum) },
    loop: { type: 'boolean' },
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
        },
        additionalProperties: false,
        required: ['bodyShapes', 'mainFile', 'contents'],
      },
      minItems: 1,
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: false,
  required: ['category', 'loop', 'representations', 'tags'],
})
