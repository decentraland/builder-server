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

export type Layout = {
  parcels: { x: number; y: number }[]
  base: { x: number; y: number }
}

type CompositeComponent = {
  name: string
  data: any
}

export type CompositeDefinition = {
  components: CompositeComponent[]
}

export type SceneSDK7Attributes = {
  composite: CompositeDefinition
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
      oneOf: [
        { type: 'string' },
        { type: 'object', properties: {}, additionalProperties: true },
      ],
    },
    mappings: {
      type: 'object',
      properties: {},
      additionalProperties: true,
    },
  },
  additionalProperties: true,
  required: ['composite', 'mappings'],
}

export const sceneSchema = {
  anyOf: [
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
