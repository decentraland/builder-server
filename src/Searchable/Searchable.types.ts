export type SortBy<T> = keyof T
export type SortOrder = 'DESC' | 'ASC'

export type Sort<T> = {
  by: SortBy<T> | undefined
  order: SortOrder | undefined
}

export type Limit = number
export type Offset = number

export type Pagination = {
  limit: Limit
  offset: Offset
}

export type Bounds<T> = {
  sort: {
    by: SortBy<T>[]
    order: SortOrder[]
  }
  pagination: {
    limit: Limit
    offset: Offset
  }
}

export type Parameters<T> = {
  sort: Sort<T>
  pagination: Pagination
}
