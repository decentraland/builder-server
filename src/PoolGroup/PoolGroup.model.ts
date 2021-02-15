import { Model, SQL, raw } from 'decentraland-server'

import {
  PoolGroupAttributes,
  GetPoolGroupsFilters,
  GetOnePoolGroupFilters,
} from './PoolGroup.types'

const UUID = /^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$/

export class PoolGroup extends Model<PoolGroupAttributes> {
  static tableName = 'pool_groups'

  static async findOneByFilters({
    id,
    ...extra
  }: Omit<
    GetOnePoolGroupFilters,
    'limit'
  >): Promise<PoolGroupAttributes | null> {
    const filters: GetPoolGroupsFilters = {
      ...extra,
      limit: 1,
    }

    if (id) {
      filters.ids = [id]
    }

    const result = await this.findByFilters(filters)

    if (result.length) {
      return result[0]
    }

    return null
  }

  static async findByFilters({
    ids,
    activeOnly,
    limit,
  }: GetPoolGroupsFilters): Promise<PoolGroupAttributes[]> {
    const conditionStatement = SQL`WHERE 1 = 1`
    const limitStatement = SQL``

    if (Array.isArray(ids)) {
      ids = ids.filter((id) => UUID.test(String(id)))
      if (ids.length === 0) {
        return []
      }
      conditionStatement.append(
        SQL` AND id IN ${raw(
          '(' + ids.map((id) => `'${id}'`).join(', ') + ')'
        )}`
      )
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
