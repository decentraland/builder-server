export type SceneAttributes = {
  entities: Record<string, SceneEntityAttributes>
  components: Record<string, SceneComponentAttribute>
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

export const sceneSchema = {
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
