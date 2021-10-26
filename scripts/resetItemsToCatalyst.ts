import { Item } from '../src/Item/Item.model'
import { collectionAPI } from '../src/ethereum/api/collection'
import { db } from '../src/database'
import { peerAPI, Wearable } from '../src/ethereum/api/peer'
import { FullItem, ItemAttributes } from '../src/Item'
import { Bridge } from '../src/ethereum/api/Bridge'
import { ItemFragment } from '../src/ethereum/api/fragments'

async function run() {
  console.log('DB: Connecting...')
  const connection = await db.connect()
  console.log('DB: Connected!')

  try {
    const dbItems = await getDbItems()
    const remoteItems = await getRemoteItems()
    const catalystItems = await getCatalystItems(remoteItems)
    const consolidated = await consolidate(dbItems, remoteItems, catalystItems)

    const catalystItemsByUrn = catalystItems.reduce((acc, next) => {
      acc[next.id] = next
      return acc
    }, {} as Record<string, Wearable>)

    const different = consolidated.filter(
      (item) =>
        item.urn &&
        catalystItemsByUrn[item.urn] &&
        isDifferent(item, catalystItemsByUrn[item.urn])
    )

    const differentIds = different.map((d) => d.id)

    console.log('Different Items:', differentIds)
  } catch (e) {
    console.log(e)
  } finally {
    connection.end()
  }
}

async function getDbItems() {
  console.log('DB Items: Fetching...')
  const items = await Item.find<ItemAttributes>()
  console.log('DB Items: Fetched #', items.length)
  return items
}

async function getRemoteItems() {
  console.log('Remote Items: Fetching...')
  const items = await collectionAPI.fetchItems()
  console.log('Remote Items: Fetched #', items.length)
  return items
}

async function getCatalystItems(remoteItems: ItemFragment[]) {
  console.log('Catalyst Items: Fetching...')
  const urns = remoteItems.map((item) => item.urn)
  const items = await peerAPI.fetchWearables(urns)
  console.log('Catalyst Items: Fetched #', items.length)
  return items
}

async function consolidate(
  dbItems: ItemAttributes[],
  remoteItems: ItemFragment[],
  catalystItems: Wearable[]
) {
  console.log('Items: Consolidating...')
  const consolidated = await Bridge.consolidateItems(
    dbItems,
    remoteItems,
    catalystItems
  )
  console.log('Items: Consolidated')
  return consolidated
}

function isDifferent(item: FullItem, catalystItem: Wearable) {
  const hasMetadataChanged =
    item.name !== catalystItem.name ||
    item.description !== catalystItem.description ||
    item.data.category !== catalystItem.data.category ||
    item.data.hides.toString() !== catalystItem.data.hides.toString() ||
    item.data.replaces.toString() !== catalystItem.data.replaces.toString() ||
    item.data.tags.toString() !== catalystItem.data.tags.toString()

  if (hasMetadataChanged) {
    return true
  }

  for (const path in item.contents) {
    const hash = item.contents[path]
    if (catalystItem.contents[path] !== hash) {
      return true
    }
  }

  return false
}

run().catch(console.error)
