import { MigrationBuilder } from 'node-pg-migrate'
import { Project } from '../src/Project'

const tableName = Project.tableName
const columnName = 'builder_in_world_created_from_xy'
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
