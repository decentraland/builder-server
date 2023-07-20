import { ManifestAttributes } from './Manifest.types'
import { ProjectStatisticsAttributes } from '../Project'
import { ComponentType } from '../Scene'

export function collectStatistics(
  manifest: ManifestAttributes
): ProjectStatisticsAttributes {
  const { project, scene } = manifest

  if (scene.sdk6) {
    const result = Object.keys(scene.sdk6.components).reduce(
      (result, key) => {
        const component = scene.sdk6.components[key]

        switch (component.type) {
          case ComponentType.GLTFShape:
            result.gltf_shapes += 1
            break
          case ComponentType.NFTShape:
            result.nft_shapes += 1
            break
          case ComponentType.Script:
            result.scripts += 1
            break
          case ComponentType.Transform:
            result.transforms += 1
            break
        }

        return result
      },
      {
        cols: project.cols,
        rows: project.rows,
        parcels: project.rows * project.cols,
        entities:
          Object.keys(scene.sdk6.entities).length - project.rows * project.cols,
        transforms: 0,
        scripts: 0,
        gltf_shapes: 0,
        nft_shapes: 0,
      } as ProjectStatisticsAttributes
    )

    result.transforms = result.transforms - project.rows * project.cols
    result.gltf_shapes -= 1

    return result
  } else {
    return {
      cols: project.cols,
      rows: project.rows,
      parcels: project.rows * project.cols,
      // TODO: gather metrics from SDK7
      entities: 0,
      transforms: 0,
      scripts: 0,
      gltf_shapes: 0,
      nft_shapes: 0,
    }
  }
}
