import { Project } from '../src/Project'
import { MigrationBuilder } from 'node-pg-migrate'

const tableName = Project.tableName
const columnName = 'creation_coords'
const columns = {
  [columnName]: {
    type: 'TEXT',
    default: null,
    notNull: false,
    unique: true,
  },
}

export const up = (pgm: MigrationBuilder) => {
  pgm.addColumn(tableName, columns)
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropColumn(tableName, columnName)
}
