import { SQL, raw } from 'decentraland-server'

import { db } from '../database'
import { SearchableParameters } from './SearchableParameters'
import { SearchableConditions } from './SearchableConditions'

export class SearchableModel<T> {
  tableName: string

  constructor(tableName: string) {
    this.tableName = tableName
  }

  async search(
    parameters: SearchableParameters<T>,
    conditions?: SearchableConditions<T>
  ) {
    const { sort, pagination } = parameters.sanitize()

    const conditionsQuery = SQL`WHERE 1 = 1`

    if (conditions) {
      const { eq, notEq } = conditions.sanitize()

      Object.keys(eq).forEach(columnName =>
        conditionsQuery.append(SQL` AND ${raw(columnName)} = ${eq[columnName]}`)
      )
      Object.keys(notEq).forEach(columnName =>
        conditionsQuery.append(
          SQL` AND ${raw(columnName)} != ${notEq[columnName]}`
        )
      )
    }

    const sortQuery =
      sort.by && sort.order
        ? SQL`ORDER BY ${raw(sort.by.toString())} ${raw(sort.order)}`
        : SQL``

    const paginationQuery = SQL`LIMIT ${raw(pagination.limit)} OFFSET ${raw(
      pagination.offset
    )}`

    return db.query(
      SQL`SELECT *
        FROM ${raw(this.tableName)}
        ${conditionsQuery}
        ${sortQuery}
        ${paginationQuery}`
    )
  }
}
