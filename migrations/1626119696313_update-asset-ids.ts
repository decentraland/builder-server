import { MigrationBuilder } from 'node-pg-migrate'
import { Asset } from '../src/Asset'

const tableName = Asset.tableName
const columns = ['id', 'asset_pack_id']

export const up = (pgm: MigrationBuilder) => {
	pgm.sql(`TRUNCATE TABLE ${tableName};`)

	pgm.dropConstraint(tableName, 'assets_pkey')
	pgm.addConstraint(tableName, 'assets_pkey', { primaryKey: 'id' })

	// pgm won't infer this name correctly, so we need to nudge it a little
	pgm.dropIndex(tableName, columns, {
		name: 'assets_id_asset_pack_id_unique_index',
	})
	pgm.addIndex(tableName, 'id', { unique: true })
}

export const down = (pgm: MigrationBuilder) => {
	// We can't regeneate truncated assets but they're regenerated with the seed command so we truncate again
	pgm.sql(`TRUNCATE TABLE ${tableName};`)

	pgm.dropConstraint(tableName, 'assets_pkey')
	pgm.addConstraint(tableName, 'assets_pkey', {
		primaryKey: columns,
	})

	pgm.addIndex(tableName, columns, { unique: true })
}
