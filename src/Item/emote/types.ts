import {
  BodyShape,
  EmoteCategory,
  EmoteDataADR74,
  EmoteDataADR287,
  StartAnimation,
  OutcomeGroup,
} from '@dcl/schemas'

export type EmoteRepresentation = {
  bodyShapes: BodyShape[]
  mainFile: string
  contents: string[]
}

export type EmoteData = EmoteDataADR74 | EmoteDataADR287

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
    startAnimation: StartAnimation.schema,
    randomizeOutcomes: {
      type: 'boolean',
    },
    outcomes: {
      type: 'array',
      items: OutcomeGroup.schema,
      minItems: 1,
      maxItems: 3,
    },
  },
  additionalProperties: false,
  required: ['category', 'loop', 'representations', 'tags'],
})
