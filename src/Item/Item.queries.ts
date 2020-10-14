import { SQL, raw } from 'decentraland-server'
import { Collection } from '../Collection'
import { Item } from './Item.model'

export const ItemQueries = Object.freeze({
  selectWithCollection: () =>
    SQL`SELECT items.*, row_to_json(collections.*) as collection
      FROM ${raw(Item.tableName)} as items
      LEFT JOIN ${raw(
        Collection.tableName
      )} as collections ON collections.id = items.collection_id`
})
