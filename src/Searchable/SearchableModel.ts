import { SQL, raw } from 'decentraland-server'

import { db } from '../database'
import { SearchableParameters } from './SearchableParameters'
import { SearchableConditions } from './SearchableConditions'
import { Pagination, Sort } from './Searchable.types'

export class SearchableModel<T> {
  constructor(public readonly tableName: string) {}

  async search(
    parameters: SearchableParameters<T>,
    conditions?: SearchableConditions<T>
  ) {
    const { sort, pagination } = parameters.sanitize()

    const conditionsQuery = this.getConditionsQuery(conditions)
    const sortQuery = this.getSortQuery(sort)
    const paginationQuery = this.getPaginationQuery(pagination)

    const [items, counts] = await Promise.all([
      db.query(
        SQL`SELECT *
        FROM ${raw(this.tableName)}
        ${conditionsQuery}
        ${sortQuery}
        ${paginationQuery}`
      ),
      db.query(
        SQL`SELECT COUNT(*)
        FROM ${raw(this.tableName)}
        ${conditionsQuery}`
      ),
    ])

    return { items, total: Number(counts[0].count) }
  }

  private getConditionsQuery(conditions?: SearchableConditions<T>) {
    const conditionsQuery = SQL`WHERE 1 = 1`

    if (conditions) {
      const { eq, notEq, includes } = conditions.sanitize()

      for (const columnName in eq) {
        conditionsQuery.append(SQL` AND ${raw(columnName)} = ${eq[columnName]}`)
      }
      for (const columnName in notEq) {
        conditionsQuery.append(
          SQL` AND ${raw(columnName)} != ${notEq[columnName]}`
        )
      }
      for (const columnName in includes) {
        conditionsQuery.append(
          SQL` AND ${includes[columnName]} = ANY(${raw(columnName)})`
        )
      }
    }
    return conditionsQuery
  }

  private getSortQuery(sort: Sort<T>) {
    const sortQuery = SQL``

    if (Object.keys(sort).length > 0) {
      const sortQueryParts: string[] = []

      for (const by in sort) {
        sortQueryParts.push(`${by} ${sort[by]}`)
      }

      sortQuery.append('ORDER BY ')
      sortQuery.append(sortQueryParts.join(', '))
    }

    return sortQuery
  }

  private getPaginationQuery(pagination: Pagination) {
    const paginationQuery = SQL``

    if (pagination.limit) {
      paginationQuery.append(SQL`LIMIT ${raw(pagination.limit)} `)
    }
    if (pagination.offset) {
      paginationQuery.append(SQL`OFFSET ${raw(pagination.offset)}`)
    }

    return paginationQuery
  }
}
