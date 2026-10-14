import { MigrationBuilder } from 'node-pg-migrate'
import { CollectionCuration } from '../src/Curation/CollectionCuration'

const tableName = CollectionCuration.tableName
const indexName = 'collection_curations_collection_id_pending_unique'

export const up = (pgm: MigrationBuilder) => {
  // Every read picks a collection's newest curation, so a pending row behind a newer one is unreachable
  // and would only block the index. Most of them come from Third Party publishes, which inserted a new
  // virtual curation on every publish instead of refreshing the existing one; a few from concurrent
  // review requests. `down` cannot restore them.
  pgm.sql(`
    DELETE FROM ${tableName} stale
    WHERE stale.status = 'pending'
      AND stale.id <> (
        SELECT newest.id
        FROM ${tableName} newest
        WHERE newest.collection_id = stale.collection_id
        ORDER BY newest.created_at DESC, newest.id DESC
        LIMIT 1
      )
  `)

  pgm.createIndex(tableName, 'collection_id', {
    name: indexName,
    unique: true,
    where: "status = 'pending'",
  })
}

export const down = (pgm: MigrationBuilder) => {
  pgm.dropIndex(tableName, 'collection_id', { name: indexName })
}
