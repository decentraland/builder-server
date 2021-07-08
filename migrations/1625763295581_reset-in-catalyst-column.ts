import { MigrationBuilder } from 'node-pg-migrate'
import { Item } from '../src/Item'

const tableName = Item.tableName

export const up = (pgm: MigrationBuilder) => {
	pgm.sql(`UPDATE ${tableName} set in_catalyst=FALSE`)
}

// No down migration as we cannot infer how the column looked before being reset.
// We're using backups for this
export const down = (_pgm: MigrationBuilder) => {}
