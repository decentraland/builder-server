import { Request } from 'express'

import { RequestParameters } from './RequestParameters'

type SortBy<T> = keyof T
type SortOrder = 'DESC' | 'ASC'

export type Bounds<T> = {
  sort: {
    by: SortBy<T>[]
    order: SortOrder[]
  }
  pagination: {
    limit: number
    offset: number
  }
}
type BaseAttributes = Record<string, any>

const MIN_PAGINATION_LIMIT = 1
const MAX_PAGINATION_LIMIT = 100

const DEFAULT_BOUNDS: Bounds<BaseAttributes> = {
  sort: {
    by: [],
    order: []
  },
  pagination: {
    offset: 0,
    limit: 20
  }
}

export class FilterRequestParameters<T = BaseAttributes> {
  requestParameters: RequestParameters
  bounds: Bounds<T>

  // TODO: Bounds to partial
  constructor(req: Request, bounds?: Bounds<T>) {
    this.requestParameters = new RequestParameters(req)
    this.bounds = bounds ? bounds : DEFAULT_BOUNDS
  }

  sanitize() {
    return {
      sort: this.getSort(),
      pagination: this.getPagination()
    }
  }

  private getSort() {
    const { sort } = this.bounds

    const sortBy = this.requestParameters.get<string>('sort_by', '')
    const sortOrder = this.requestParameters.get<string>('sort_order', '')

    return {
      by: sort.by.find(value => value === sortBy),
      order: sort.order.find(value => value === sortOrder)
    }
  }

  // TODO: This is not a bound is a default
  private getPagination() {
    const { pagination } = this.bounds

    const limit = this.requestParameters.getInteger('limit', pagination.limit)
    const offset = this.requestParameters.getInteger(
      'offset',
      pagination.offset
    )

    return {
      limit: Math.max(
        Math.min(MAX_PAGINATION_LIMIT, limit),
        MIN_PAGINATION_LIMIT
      ),
      offset: Math.max(offset, 0)
    }
  }
}
