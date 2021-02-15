import { ProjectAttributes, projectSchema } from '../Project'
import { SceneAttributes, sceneSchema } from '../Scene'

export type ManifestAttributes = {
  version: number
  project: ProjectAttributes
  scene: SceneAttributes
}

export const manifestSchema = Object.freeze({
  type: 'object',
  properties: {
    version: { type: 'number' },
    project: projectSchema,
    scene: sceneSchema,
  },
  additionalProperties: false,
  required: ['version', 'project', 'scene'],
})
