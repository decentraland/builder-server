import { RequestParameters } from '../RequestParameters'
import {
  Sort,
  Pagination,
  Parameters,
  BaseAttributes
} from './Searchable.types'
import {
  Whitelist,
  Bounds,
  PartialWhitelist,
  PartialBounds
} from './SearchableParameters.types'

const DEFAULT_WHITELIST: Whitelist<BaseAttributes> = {
  sort: {
    by: [],
    order: ['ASC', 'DESC']
  }
}
const DEFAULT_BOUNDS: Bounds = {
  pagination: {
    offset: 0,
    limit: 100
  }
}
const MIN_PAGINATION_LIMIT = 1

export class SearchableParameters<T = BaseAttributes> {
  requestParameters: RequestParameters
  whitelist: Whitelist<T>
  bounds: Bounds

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
        sort: { ...this.whitelist.sort, ...whitelist.sort }
      }
    }

    if (bounds) {
      this.bounds = {
        pagination: { ...this.bounds.pagination, ...bounds.pagination }
      }
    }
  }

  sanitize(): Parameters<T> {
    return {
      sort: this.getSort(),
      pagination: this.getPagination()
    }
  }

  private getSort(): Sort<T> {
    const { sort } = this.whitelist

    const sortBy = this.requestParameters.getString('sort_by', '')
    const sortOrder = this.requestParameters.getString('sort_order', '')

    return {
      by: sort.by.find(value => value === sortBy),
      order: sort.order.find(value => value === sortOrder)
    }
  }

  private getPagination(): Pagination {
    const { pagination } = this.bounds

    const limit = this.requestParameters.getInteger('limit', 0)
    const offset = this.requestParameters.getInteger('offset', 0)

    return {
      limit: Math.max(Math.min(pagination.limit, limit), MIN_PAGINATION_LIMIT),
      offset: Math.max(offset, pagination.offset)
    }
  }
}
