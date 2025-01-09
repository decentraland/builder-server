import { WearableCategory, BodyShape, HideableWearableCategory } from '@dcl/schemas'

export type WearableRepresentation = {
  bodyShapes: BodyShape[]
  mainFile: string
  contents: string[]
  overrideReplaces: HideableWearableCategory[]
  overrideHides: HideableWearableCategory[]
}

export type WearableData = {
  category: WearableCategory
  representations: WearableRepresentation[]
  replaces: HideableWearableCategory[]
  hides: HideableWearableCategory[]
  removesDefaultHiding?: HideableWearableCategory[]
  tags: string[]
  blockVrmExport?: boolean
  outlineCompatible?: boolean
}

export type SmartWearableData = WearableData & {
  requiredPermissions: string[]
}

export const wearableSchema = Object.freeze({
  type: 'object',
  properties: {
    category: WearableCategory.schema,
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
          overrideReplaces: {
            type: 'array',
            items: HideableWearableCategory.schema,
          },
          overrideHides: {
            type: 'array',
            items: HideableWearableCategory.schema,
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
      items: HideableWearableCategory.schema,
    },
    hides: {
      type: 'array',
      items: HideableWearableCategory.schema,
    },
    removesDefaultHiding: {
      type: 'array',
      items: HideableWearableCategory.schema
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
    requiredPermissions: {
      type: 'array',
      items: { type: 'string' },
    },
    blockVrmExport: {
      type: 'boolean',
      nullable: true
    },
    outlineCompatible: {
      type: 'boolean',
      nullable: true
    }
  },
  additionalProperties: false,
  required: ['category', 'representations', 'replaces', 'hides', 'tags'],
})
