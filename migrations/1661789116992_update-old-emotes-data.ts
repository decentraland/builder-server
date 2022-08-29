/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder } from 'node-pg-migrate'
import { Item } from '../src/Item'

const tableName = Item.tableName

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(
    `UPDATE ${tableName} 
      SET data=data::jsonb || '{"category":"poses","loop":false}'::jsonb,
          local_content_hash=NULL
      WHERE type = 'emote' AND data::json->'loop' IS NULL`
  )
}
