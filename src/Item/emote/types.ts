import { StandardWearable } from '@dcl/schemas'
import { WearableBodyShape } from '../wearable/types'

export type Emote = Omit<StandardWearable, 'data'> & {
  emoteDataADR74: {
    category: EmoteCategory
    representations: {
      bodyShapes: WearableBodyShape[]
      mainFile: string
      contents: string[]
    }[]
    tags: string[]
    loop: boolean
  }
}

export enum EmoteCategory {
  SIMPLE = 'simple',
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
