import { MigrationBuilder } from 'node-pg-migrate'
import { Project } from '../src/Project'

const tableName = Project.tableName
const constraintToRemove = 'projects_creation_coords_key'

// This query will delete all the deleted project created from builder in world so it can create the constraint again
const sqlQuery = `DELETE FROM ${tableName} WHERE is_deleted = true AND creation_coords IS NOT NULL`

export const up = (pgm: MigrationBuilder) => {
  pgm.dropConstraint(tableName, constraintToRemove)
}

export const down = (pgm: MigrationBuilder) => {
  pgm.sql(sqlQuery)
  pgm.addConstraint(tableName, constraintToRemove, 'unique (creation_coords)')
}
