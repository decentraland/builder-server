import { MigrationBuilder } from 'node-pg-migrate'
import { Pool } from '../src/Pool'

const tableName = Pool.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumns(tableName, {
    likes: {
      type: 'INTEGER',
      notNull: true,
      default: 0,
    },
  })
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropColumn(tableName, 'likes')
}
