import { RequestParameters } from '../RequestParameters'
import { Sort, Bounds, Pagination, Parameters } from './Searchable.types'

type PartialBounds<T> = {
  sort?: Partial<Bounds<T>['sort']>
  pagination?: Partial<Bounds<T>['pagination']>
}
type BaseAttributes = Record<string, any>

const MIN_PAGINATION_LIMIT = 1

const DEFAULT_BOUNDS: Bounds<BaseAttributes> = {
  sort: {
    by: [],
    order: ['ASC', 'DESC']
  },
  pagination: {
    offset: 0,
    limit: 100
  }
}

export class SearchableParameters<T = BaseAttributes> {
  requestParameters: RequestParameters
  bounds: Bounds<T>

  constructor(requestParameters: RequestParameters, bounds?: PartialBounds<T>) {
    this.requestParameters = requestParameters
    this.bounds = DEFAULT_BOUNDS

    if (bounds) {
      this.bounds = {
        sort: { ...this.bounds.sort, ...bounds.sort },
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
    const { sort } = this.bounds

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
