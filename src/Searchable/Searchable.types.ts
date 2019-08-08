export type SortBy<T> = keyof T
export type SortOrder = 'DESC' | 'ASC'

export type Sort<T> = Partial<Record<SortBy<T>, SortOrder>>

export type Limit = number
export type Offset = number

export type Pagination = Partial<{
  limit: Limit
  offset: Offset
}>

export type Parameters<T> = {
  sort: Sort<T>
  pagination: Pagination
}

export type BaseAttributes = Record<string, any>
