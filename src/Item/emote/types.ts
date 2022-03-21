import { WearableBodyShape } from '../wearable/types'

export enum EmoteCategory {
  SIMPLE = 'simple',
  LOOP = 'loop',
}

export type EmoteRepresentation = {
  bodyShapes: WearableBodyShape[]
  mainFile: string
  contents: string[]
}

export type EmoteData = {
  category?: EmoteCategory
  representations: EmoteRepresentation[]
  tags: string[]
}

export const emoteSchema = Object.freeze({
  type: 'object',
  properties: {
    category: { enum: Object.values(EmoteCategory) },
    representations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          bodyShapes: {
            type: 'array',
            items: { enum: Object.values(WearableBodyShape) },
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
  required: ['representations', 'tags'],
})
