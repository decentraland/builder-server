import { ProjectAttributes, projectSchema } from '../Project'
import { SceneAttributes, sceneSchema } from '../Scene'

export type Manifest = {
  version: number
  project: ProjectAttributes
  scene: SceneAttributes
}

export const manifestSchema = {
  type: 'object',
  properties: {
    version: { type: 'number' },
    project: projectSchema,
    scene: sceneSchema
  },
  additionalProperties: false
}
