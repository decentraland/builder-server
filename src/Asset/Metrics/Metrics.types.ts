export type MetricsAttributes = {
  triangles: number
  materials: number
  geometries: number
  bodies: number
  entities: number
  textures: number
}

export const metricsSchema = Object.freeze({
  type: 'object',
  properties: {
    triangles: { type: 'number', minimum: 0 },
    materials: { type: 'number', minimum: 0 },
    geometries: { type: 'number', minimum: 0 },
    bodies: { type: 'number', minimum: 0 },
    entities: { type: 'number', minimum: 0 },
    textures: { type: 'number', minimum: 0 }
  },
  additionalProperties: false,
  removeAdditional: true,
  required: [
    'triangles',
    'materials',
    'geometries',
    'bodies',
    'entities',
    'textures'
  ]
})
