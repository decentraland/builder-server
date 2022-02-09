export enum WearableCategory {
  EYEBROWS = 'eyebrows',
  EYES = 'eyes',
  FACIAL_HAIR = 'facial_hair',
  HAIR = 'hair',
  MOUTH = 'mouth',
  UPPER_BODY = 'upper_body',
  LOWER_BODY = 'lower_body',
  FEET = 'feet',
  EARRING = 'earring',
  EYEWEAR = 'eyewear',
  HAT = 'hat',
  HEAD = 'head',
  HELMET = 'helmet',
  MASK = 'mask',
  TIARA = 'tiara',
  TOP_HEAD = 'top_head',
  SKIN = 'skin',
}

export enum WearableBodyShape {
  MALE = 'urn:decentraland:off-chain:base-avatars:BaseMale',
  FEMALE = 'urn:decentraland:off-chain:base-avatars:BaseFemale',
}

export type WearableRepresentation = {
  bodyShapes: WearableBodyShape[]
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
    category: { enum: Object.values(WearableCategory) },
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
          overrideReplaces: {
            type: 'array',
            items: { enum: Object.values(WearableCategory) },
          },
          overrideHides: {
            type: 'array',
            items: { enum: Object.values(WearableCategory) },
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
      items: { enum: Object.values(WearableCategory) },
    },
    hides: {
      type: 'array',
      items: { enum: Object.values(WearableCategory) },
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: false,
  required: ['representations', 'replaces', 'hides', 'tags'],
})
