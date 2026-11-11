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

export enum TemplateStatus {
  ACTIVE = 'active',
  COMING_SOON = 'coming_soon',
}

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

export const sortableTemplateProperties = {
  sort: {
    by: [
      'template_status',
      'created_at',
      'updated_at',
    ] as (keyof ProjectAttributes)[],
  },
}
