import { MigrationBuilder } from 'node-pg-migrate'
import { Project } from '../src/Project'

const tableName = Project.tableName
const columnName = 'is_public'
const columns = {
  [columnName]: {
    type: 'BOOLEAN',
    default: false,
    notNull: true,
  },
}

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumn(tableName, columns)
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropColumn(tableName, columnName)
}
