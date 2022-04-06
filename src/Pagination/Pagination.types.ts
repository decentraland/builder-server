export type PaginationAttributes = {
  total_count: number
}

export type PaginatedResponse<T> = {
  results: T[]
  total: number
  page: number
  pages: number
  limit: number
}
