export type ProjectAttributes = {
  id: string
  title: string
  description?: string
  thumbnail?: string
  scene_id: string
  eth_address: string | null
  cols: number
  rows: number
  parcels: number
  transforms: number
  gltf_shapes: number
  nft_shapes: number
  scripts: number
  entities: number
  is_deleted: boolean
  is_public: boolean
  created_at: Date
  updated_at: Date
  creation_coords: string
  is_template: boolean
  video?: string
  template_status?: TemplateStatus
}

export type ProjectStatisticsAttributes = Pick<
  ProjectAttributes,
  | 'cols'
  | 'rows'
  | 'parcels'
  | 'transforms'
  | 'scripts'
  | 'entities'
  | 'gltf_shapes'
  | 'nft_shapes'
>

export enum TemplateStatus {
  ACTIVE = 'active',
  COMING_SOON = 'coming_soon',
}

export const projectSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: { type: 'string' },
    thumbnail: { type: ['string', 'null'] },
    scene_id: { type: 'string', format: 'uuid' },
    eth_address: { type: ['string', 'null'] },
    cols: { type: 'number' },
    rows: { type: 'number' },
    is_public: { type: ['boolean', 'null'] },
    created_at: { type: ['string', 'null'] },
    updated_at: { type: ['string', 'null'] },
    creation_coords: { type: 'string' },
    is_template: { type: ['boolean', 'null'] },
    video: { type: ['string', 'null'] },
    template_status: {
      type: ['string', 'null'],
      enum: [TemplateStatus.COMING_SOON, TemplateStatus.ACTIVE, null],
    },
  },
  additionalProperties: false,
  required: ['id', 'title', 'description', 'scene_id', 'cols', 'rows'],
})

export const searchableProjectProperties: (keyof ProjectAttributes)[] = [
  'title',
  'description',
  'cols',
  'rows',
  'created_at',
  'updated_at',
  'creation_coords',
  'is_template',
  'template_status',
]
