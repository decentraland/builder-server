import { SQL, raw } from 'decentraland-server'
import { Item } from '../Item'
import { Collection } from './Collection.model'

export const CollectionQueries = Object.freeze({
  selectWithItems: () =>
    SQL`
      SELECT *, ${CollectionQueries.selectItems()}
        FROM ${raw(Collection.tableName)}`,

  selectItems: (alias = 'items') =>
    SQL`ARRAY(
      SELECT row_to_json(items.*)
        FROM ${raw(Item.tableName)} as items
        WHERE items.collection_id = ${raw(Collection.tableName)}.id
      ) as ${raw(alias)}`
})
