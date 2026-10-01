import { MigrationBuilder } from 'node-pg-migrate'

const tableName = 'collection_events'
const indexName = 'collection_events_verdict_validation_idx'
const verdictTypes = [
  'review.ai_passed',
  'review.ai_rejected',
  'review.ai_error',
  'review.human_required',
]

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createIndex(
    tableName,
    ['collection_id', 'type', "(payload->>'validationId')"],
    {
      name: indexName,
      unique: true,
      where: `type IN (${verdictTypes.map((type) => `'${type}'`).join(',')})`,
    }
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(tableName, [], { name: indexName })
}
