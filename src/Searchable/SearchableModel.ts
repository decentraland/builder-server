import { SQL, raw } from 'decentraland-server'

import { db } from '../database'
import { Parameters } from './Searchable.types'

export class SearchableModel<T> {
  tableName: string

  constructor(tableName: string) {
    this.tableName = tableName
  }

  // TODO: Conditions
  async search(parameters: Parameters<T>) {
    const { sort, pagination } = parameters

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
