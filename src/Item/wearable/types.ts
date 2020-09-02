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
  HELMET = 'helmet',
  MASK = 'mask',
  TIARA = 'tiara',
  TOP_HEAD = 'top_head'
}

export enum WearableBodyShape {
  MALE = 'dcl://base-avatars/BaseMale',
  FEMALE = 'dcl://base-avatars/BaseFemale'
}

export type WearableRepresentation = {
  bodyShape: WearableBodyShape[]
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
          bodyShape: {
            type: 'array',
            items: { enum: Object.values(WearableBodyShape) }
          },
          mainFile: { type: 'string' },
          contents: {
            type: 'array',
            items: { type: 'string' }
          },
          overrideReplaces: {
            type: 'array',
            items: { enum: Object.values(WearableCategory) }
          },
          overrideHides: {
            type: 'array',
            items: { enum: Object.values(WearableCategory) }
          }
        },
        additionalProperties: false,
        removeAdditional: true,
        required: [
          'bodyShape',
          'mainFile',
          'contents',
          'overrideReplaces',
          'overrideHides'
        ]
      }
    },
    replaces: {
      type: 'array',
      items: { enum: Object.values(WearableCategory) }
    },
    hides: {
      type: 'array',
      items: { enum: Object.values(WearableCategory) }
    },
    tags: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  additionalProperties: false,
  removeAdditional: true,
  required: ['representations', 'replaces', 'hides', 'tags']
})
