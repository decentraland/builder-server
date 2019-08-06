import { SQL, raw } from 'decentraland-server'

import { db } from '../database'
import { FilterRequestParameters } from '../RequestParameters'

export class FiltrableModel<T> {
  tableName: string

  constructor(tableName: string) {
    this.tableName = tableName
  }

  // TODO: Conditions
  // TODO: Fix, typings. They're intertwined
  search(filters: FilterRequestParameters<T>) {
    const { sort, pagination } = filters.sanitize()

    const sortQuery =
      sort.by && sort.order
        ? SQL`ORDER BY ${raw(sort.by.toString())} ${raw(sort.order)}`
        : SQL``

    return db.query(
      SQL`SELECT *
        FROM ${raw(this.tableName)}
        ${sortQuery}
        LIMIT ${raw(pagination.limit)} OFFSET ${raw(pagination.offset)}`
    )
  }
}
