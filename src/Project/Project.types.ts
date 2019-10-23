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
  is_public: boolean
}

export const projectSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: { type: 'string' },
    thumbnail: { type: ['string', 'null'] },
    scene_id: { type: 'string', format: 'uuid' },
    user_id: { type: ['string', 'null'] },
    cols: { type: 'number' },
    rows: { type: 'number' },
    is_public: { type: ['boolean', 'null'] },
    created_at: { type: ['string', 'null'] },
    updated_at: { type: ['string', 'null'] }
  },
  additionalProperties: false,
  removeAdditional: true,
  required: ['id', 'title', 'description', 'scene_id', 'cols', 'rows']
})

export const searchableProjectProperties: (keyof ProjectAttributes)[] = [
  'title',
  'description',
  'cols',
  'rows',
  'created_at',
  'updated_at'
]
