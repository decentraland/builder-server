export type PoolGroupAttributes = {
  id: number
  name: string
  is_active?: boolean
  active_from: Date
  active_until: Date
  created_at: Date
}

export const poolGroupSchema = {}
export const searchablePoolGroupProperties = ['active']

export type GetPoolGroupFilters = {
  id?: number
  activeOnly?: boolean
  limit?: number
}
