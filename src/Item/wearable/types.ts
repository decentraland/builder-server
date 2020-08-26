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

export enum WearableRepresentation {
  MALE = 'BaseMale',
  FEMALE = 'BaseFemale'
}

export type WearableData = {
  category?: WearableCategory
  representation?: WearableRepresentation
  replaces?: WearableCategory[]
  hides?: WearableCategory[]
  tags?: string[]
}

export const wearableSchema = Object.freeze({
  type: 'object',
  properties: {
    type: { enum: Object.values(WearableCategory) },
    representation: { enum: Object.values(WearableRepresentation) },
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
  required: ['type', 'representation', 'replaces', 'hides', 'tags']
})
