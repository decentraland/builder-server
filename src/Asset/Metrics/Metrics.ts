import { MetricsAttributes } from './Metrics.types'

export class Metrics {
  attributes: MetricsAttributes | undefined

  constructor(attributes?: MetricsAttributes) {
    this.attributes = attributes
  }

  getAttributes(): MetricsAttributes {
    return {
      triangles: 0,
      materials: 0,
      geometries: 0,
      bodies: 0,
      entities: 0,
      textures: 0,
      ...this.attributes
    }
  }
}
