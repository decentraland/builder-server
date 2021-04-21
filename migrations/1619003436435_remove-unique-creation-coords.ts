import { MigrationBuilder } from 'node-pg-migrate'
import { Project } from '../src/Project'

const tableName = Project.tableName
const constraintToRemove = 'projects_creation_coords_key'

//This query will delete all the deleted project created from builder in world so it can create the constraint again
const sqlQuery = "DELETE FROM projects where is_deleted = true and creation_coords is not null"

export const up = (pgm: MigrationBuilder) => {
  pgm.dropConstraint(tableName, constraintToRemove)
}


export const down = (pgm: MigrationBuilder) => {
  pgm.sql(sqlQuery)
  pgm.addConstraint(tableName, constraintToRemove, 'unique (creation_coords)')
}


