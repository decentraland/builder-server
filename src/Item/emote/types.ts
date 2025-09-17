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

// TODO: Replace these types using the ones from @dcl/schemas
export type EmoteOutcome = {
  animation: string
  loop: boolean
  randomize: boolean
}

type EmoteClip = {
  armature: string
  animation: string
  loop: boolean
}

type OutcomeGroup = {
  title: string
  clips: EmoteClip[]
}

export type EmoteDataADR287 = EmoteData & {
  startAnimation: EmoteClip[]
  randomizeOutcomes: boolean
  outcomes: OutcomeGroup[]
}

const emoteClipSchema = Object.freeze({
  type: 'object',
  properties: {
    armature: { type: 'string', minLength: 1 },
    animation: {
      type: 'string',
      minLength: 1,
    },
    loop: {
      type: 'boolean',
    },
  },
  required: ['armature', 'animation', 'loop'],
  additionalProperties: false,
})

const outcomeGroupSchema = Object.freeze({
  type: 'object',
  properties: {
    title: {
      type: 'string',
      minLength: 1,
    },
    clips: {
      type: 'array',
      items: emoteClipSchema,
      minItems: 1,
    },
  },
  required: ['title', 'clips'],
  additionalProperties: false,
})

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
      items: emoteClipSchema,
      minItems: 1,
    },
    randomizeOutcomes: {
      type: 'boolean',
    },
    outcomes: {
      type: 'array',
      items: outcomeGroupSchema,
      minItems: 1,
      maxItems: 4,
    },
  },
  additionalProperties: false,
  required: ['category', 'loop', 'representations', 'tags'],
})
