import { MigrationBuilder } from 'node-pg-migrate'
import { Pool } from '../src/Pool'

const tableName = Pool.tableName

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumns(tableName, {
    author_detail: {
      type: 'JSON',
      default: null
    }
  })
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropColumn(tableName, 'author_detail')
}
