import { MigrationBuilder } from 'node-pg-migrate'
import { Collection } from '../src/Collection'

const tableName = Collection.tableName
const columnName = 'lock'
const columns = {
  [columnName]: {
    type: 'TIMESTAMP',
    default: null,
    notNull: false,
  },
}

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumn(tableName, columns)
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropColumn(tableName, columnName)
}
