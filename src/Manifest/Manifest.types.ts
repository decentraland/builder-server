import { ProjectAttributes } from '../Project'
import { SceneAttributes } from '../Scene'

export type ManifestAttributes = {
  version: number
  project: ProjectAttributes
  scene: SceneAttributes
}
