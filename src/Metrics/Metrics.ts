import { MetricsAttributes } from './Metrics.types'

export class Metrics {
  attributes: MetricsAttributes | undefined

  constructor(attributes?: MetricsAttributes) {
    this.attributes = attributes
  }

  getAttributes(): MetricsAttributes {
    return {
      meshes: 0,
      bodies: 0,
      materials: 0,
      textures: 0,
      triangles: 0,
      entities: 0,
      ...this.attributes,
    }
  }
}
