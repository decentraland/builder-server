import { MigrationBuilder } from 'node-pg-migrate'
import { Project } from '../src/Project'

const tableName = Project.tableName
const columnName = 'created_location'
const columns = {
  [columnName]: {
    type: 'TEXT',
    default: null,
    notNull: false,
    unique: true
  },
}

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumn(tableName, columns)
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropColumn(tableName, columnName)
}
