import { SortBy, SortOrder, Limit, Offset } from './Searchable.types'

export type Whitelist<T> = {
  sort: {
    by: SortBy<T>[]
    order: SortOrder[]
  }
}

export type Bounds = {
  pagination: {
    limit: Limit
    offset: Offset
  }
}

export type PartialWhitelist<T> = {
  sort?: Partial<Whitelist<T>['sort']>
}
export type PartialBounds = {
  pagination?: Partial<Bounds['pagination']>
}
