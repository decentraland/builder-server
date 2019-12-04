import { ManifestAttributes } from './Manifest.types'
import { ProjectStatisticsAttributes } from '../Project'

export function collectStatistics(
  manifest: ManifestAttributes
): ProjectStatisticsAttributes {
  const { project, scene } = manifest
  const result: ProjectStatisticsAttributes = {
    cols: project.cols,
    rows: project.rows,
    parcels: project.rows * project.cols,
    entities: Object.keys(scene.entities).length - project.rows * project.cols,
    transforms: 0,
    scripts: 0,
    gltf_shapes: 0,
    nft_shapes: 0
  }

  return Object.keys(scene.components).reduce((result, _key) => {
    // const component = scene.components[key]
    // switch (component.)

    return result
  }, result)
}
