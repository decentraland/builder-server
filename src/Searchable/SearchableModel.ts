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

      for (const columnName in eq) {
        conditionsQuery.append(SQL` AND ${raw(columnName)} = ${eq[columnName]}`)
      }
      for (const columnName in notEq) {
        conditionsQuery.append(
          SQL` AND ${raw(columnName)} != ${notEq[columnName]}`
        )
      }
    }

    const sortQuery = SQL``

    if (Object.keys(sort).length > 0) {
      const sortQueryParts: string[] = []

      for (const by in sort) {
        sortQueryParts.push(`${by} ${sort[by]}`)
      }

      sortQuery.append('ORDER BY ')
      sortQuery.append(sortQueryParts.join(', '))
    }

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
