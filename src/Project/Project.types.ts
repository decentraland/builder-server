export type ProjectAttributes = {
  id: string
  title: string
  description?: string
  thumbnail?: string
  scene_id: string
  user_id: string
  cols: number
  rows: number
  created_at: Date
  updated_at: Date
}

export const pepe = 2

export const projectSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: { type: 'string' },
    thumbnail: { type: ['string', 'null'] },
    scene_id: { type: 'string', format: 'uuid' },
    cols: { type: 'number' },
    rows: { type: 'number' },
    created_at: { type: 'string', format: 'date', nullable: true },
    updated_at: { type: 'string', format: 'date', nullable: true }
  },
  additionalProperties: false,
  removeAdditional: true,
  required: [
    'id',
    'title',
    'description',
    'thumbnail',
    'scene_id',
    'cols',
    'rows'
  ]
}
