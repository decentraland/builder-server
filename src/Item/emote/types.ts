import {
  BodyShape,
  EmoteCategory,
  EmoteDataADR74,
  StartAnimation,
  OutcomeGroup,
} from '@dcl/schemas'

export type EmoteRepresentation = {
  bodyShapes: BodyShape[]
  mainFile: string
  contents: string[]
}

export type EmoteData = EmoteDataADR74

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
      ...StartAnimation.schema,
      nullable: true,
    },
    randomizeOutcomes: {
      type: 'boolean',
      nullable: true,
    },
    outcomes: {
      type: 'array',
      items: OutcomeGroup.schema,
      nullable: true,
    },
  },
  additionalProperties: false,
  required: ['category', 'loop', 'representations', 'tags'],
})
