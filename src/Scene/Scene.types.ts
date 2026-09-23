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
