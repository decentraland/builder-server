export type PoolGroupAttributes = {
  id: string
  name: string
  is_active?: boolean
  active_from: Date
  active_until: Date
  created_at: Date
}

export const poolGroupSchema = {}
export const searchablePoolGroupProperties = ['active']

export type GetOnePoolGroupFilters = {
  id?: string
  activeOnly?: boolean
}

export type GetPoolGroupsFilters = {
  ids?: string[]
  activeOnly?: boolean
  limit?: number
}
