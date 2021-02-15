import { MigrationBuilder } from 'node-pg-migrate'
import { Pool } from '../src/Pool'

const tableName = Pool.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumns(tableName, {
    groups: {
      type: 'UUID[]',
      notNull: true,
      default: '{}',
    },
  })
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropColumn(tableName, 'groups')
}
