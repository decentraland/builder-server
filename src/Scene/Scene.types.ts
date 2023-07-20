export type SceneAttributes =
  | {
      sdk6: SceneSDK6Attributes
      sdk7: null
    }
  | {
      sdk6: null
      sdk7: SceneSDK7Attributes
    }

export type SceneSDK6Attributes = {
  entities: Record<string, SceneEntityAttributes>
  components: Record<string, SceneComponentAttribute>
}

export type SceneSDK7Attributes = {
  composite: string
  mappings: Record<string, string>
}

export type SceneEntityAttributes = {
  id: string
  name: string
  components: string[]
}

export type SceneComponentAttribute = {
  id: string
  type: ComponentType
  data: any
}

export enum ComponentType {
  GLTFShape = 'GLTFShape',
  Transform = 'Transform',
  NFTShape = 'NFTShape',
  Script = 'Script',
}

export const sceneSchemaSdk6 = {
  type: 'object',
  properties: {
    entities: {
      type: 'object',
      additionalProperties: true,
    },
    components: {
      type: 'object',
      additionalProperties: true,
    },
  },
  additionalProperties: true,
  required: ['entities', 'components'],
}

export const sceneSchemaSdk7 = {
  type: 'object',
  properties: {
    composite: {
      type: 'string',
    },
    mappings: {
      type: 'string',
    },
  },
  additionalProperties: true,
  required: ['composite', 'mappings'],
}

export const sceneSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        sdk6: sceneSchemaSdk6,
        sdk7: { type: 'null' },
      },
    },
    {
      type: 'object',
      properties: {
        sdk6: { type: 'null' },
        sdk7: sceneSchemaSdk7,
      },
    },
  ],
}
