import { Model, SQL, raw } from 'decentraland-server'

import { PoolGroupAttributes, GetPoolGroupFilters } from './PoolGroup.types'

export class PoolGroup extends Model<PoolGroupAttributes> {
  static tableName = 'pool_groups'

  static async findOneByFilters(
    filters: Omit<GetPoolGroupFilters, 'limit'>
  ): Promise<PoolGroupAttributes | null> {
    const result = await this.findByFilters({ ...filters, limit: 1 })

    if (result.length) {
      return result[0]
    }

    return null
  }

  static async findByFilters({
    id,
    activeOnly,
    limit
  }: GetPoolGroupFilters): Promise<PoolGroupAttributes[]> {
    if (typeof id === 'number' && (Number.isNaN(id) || id <= 0)) {
      return []
    }

    const conditionStatement = SQL`WHERE 1 = 1`
    const limitStatement = SQL``

    if (id) {
      conditionStatement.append(SQL` AND id = ${id}`)
    }

    if (activeOnly) {
      const now = new Date()
      conditionStatement.append(SQL` AND active_until > ${now}`)
      conditionStatement.append(SQL` AND active_from <= ${now}`)
    }

    if (limit) {
      limitStatement.append(SQL` LIMIT ${limit}`)
    }

    return PoolGroup.query(SQL`
      SELECT
        *,
        active_until > now() AND active_from <= now() as is_active
      FROM
        ${raw(PoolGroup.tableName)}
      ${conditionStatement}
      ${limitStatement}
    `)
  }
}
