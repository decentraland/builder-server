import { BodyShape, EmoteCategory, EmoteClip, OutcomeGroup } from '@dcl/schemas'

export type EmoteRepresentation = {
  bodyShapes: BodyShape[]
  mainFile: string
  contents: string[]
}

export type EmoteOutcome = {
  animation: string
  loop: boolean
  randomize: boolean
}

export type EmoteData = {
  category: EmoteCategory
  representations: EmoteRepresentation[]
  tags: string[]
}

export type EmoteDataADR287 = EmoteData & {
  startAnimation: EmoteClip[]
  randomizeOutcomes: boolean
  outcomes: OutcomeGroup[]
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
    startAnimation: {
      type: 'array',
      items: EmoteClip.schema,
      minItems: 1,
    },
    randomizeOutcomes: {
      type: 'boolean',
    },
    outcomes: {
      type: 'array',
      items: OutcomeGroup.schema,
      minItems: 1,
      maxItems: 4,
    },
  },
  additionalProperties: false,
  required: ['category', 'loop', 'representations', 'tags'],
})
