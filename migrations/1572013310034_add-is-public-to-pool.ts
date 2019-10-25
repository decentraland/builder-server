import { MigrationBuilder } from 'node-pg-migrate'
import { Pool } from '../src/Pool'

const tableName = Pool.tableName
const columnName = 'is_public'
const columns = {
  [columnName]: {
    type: 'BOOLEAN',
    default: false,
    notNull: true
  }
}

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumn(tableName, columns)
}
