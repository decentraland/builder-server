export type SceneAttributes = {
  entities: Record<string, any>
  components: Record<string, any>
}

export type SceneEntitiesAttributes = {}

export const sceneSchema = {
  type: 'object',
  properties: {
    entities: {
      type: 'object',
      additionalProperties: true
    },
    components: {
      type: 'object',
      additionalProperties: true
    }
  },
  additionalProperties: true,
  required: ['entities', 'components']
}
