import { toArray } from '../utils/parse'
import { RequestParameters } from '../RequestParameters'
import {
  Sort,
  Pagination,
  Parameters,
  BaseAttributes,
} from './Searchable.types'
import {
  Whitelist,
  Bounds,
  PartialWhitelist,
  PartialBounds,
} from './SearchableParameters.types'

const DEFAULT_WHITELIST: Whitelist<BaseAttributes> = {
  sort: {
    by: [],
    order: ['ASC', 'DESC'],
  },
}
const DEFAULT_BOUNDS: Bounds = {
  pagination: {
    offset: 0,
    limit: 100,
  },
}
const MIN_PAGINATION_LIMIT = 0

export class SearchableParameters<T = BaseAttributes> {
  requestParameters: RequestParameters
  private whitelist: Whitelist<T>
  private bounds: Bounds

  constructor(
    requestParameters: RequestParameters,
    whitelist?: PartialWhitelist<T>,
    bounds?: PartialBounds
  ) {
    this.requestParameters = requestParameters
    this.whitelist = DEFAULT_WHITELIST
    this.bounds = DEFAULT_BOUNDS

    if (whitelist) {
      this.whitelist = {
        sort: { ...this.whitelist.sort, ...whitelist.sort },
      }
    }

    if (bounds) {
      this.bounds = {
        pagination: { ...this.bounds.pagination, ...bounds.pagination },
      }
    }
  }

  sanitize(): Parameters<T> {
    return {
      sort: this.getSort(),
      pagination: this.getPagination(),
    }
  }

  private getSort(): Sort<T> {
    const { sort } = this.whitelist

    const sortBy = toArray(
      this.requestParameters.get<string | string[]>('sort_by', [])
    )
    const sortOrder = toArray(
      this.requestParameters.get<string | string[]>('sort_order', [])
    )

    if (sortBy.length !== sortOrder.length) {
      throw new Error(
        `The sort_by and sort_order keys should have the same length`
      )
    }

    const sortResult: Sort<T> = {}

    for (let i = 0; i < sortBy.length; i++) {
      const by = sort.by.find((value) => value === sortBy[i])
      const order = sort.order.find(
        (value) => value === sortOrder[i].toUpperCase()
      )

      if (by && order) {
        sortResult[by] = order
      }
    }

    return sortResult
  }

  private getPagination(): Pagination {
    const { pagination } = this.bounds

    const limit = this.requestParameters.get<number | null>('limit', null)
    const offset = this.requestParameters.get<number | null>('offset', null)

    const paginationResult: Pagination = {}

    if (limit !== null) {
      paginationResult.limit = Math.max(
        Math.min(pagination.limit, limit),
        MIN_PAGINATION_LIMIT
      )
    }

    if (offset !== null) {
      paginationResult.offset = Math.max(offset, pagination.offset)
    }

    return paginationResult
  }
}
