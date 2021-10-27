import readline from 'readline'
import { Item } from '../src/Item/Item.model'
import { collectionAPI } from '../src/ethereum/api/collection'
import { db } from '../src/database'
import { peerAPI, PEER_URL, Wearable } from '../src/ethereum/api/peer'
import { FullItem, ItemAttributes } from '../src/Item'
import { Bridge } from '../src/ethereum/api/Bridge'
import { ItemFragment } from '../src/ethereum/api/fragments'
import { toDBItem } from '../src/Item/utils'
import { ACL, S3Content } from '../src/S3'

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

    if (different.length === 0) {
      console.log('No items in the db unsynced with the catalyst')
      return
    }

    const differentIds = different.map((item) => item.id)

    console.log('Different Items:', differentIds)

    const userWantsToContinue = await askForConfirmation()

    if (!userWantsToContinue) {
      return
    }

    for (const item of different) {
      await resetItem(item, catalystItemsByUrn[item.urn!])
    }

    console.log('Different items were reset successfuly!')
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

  console.log('Items: Consolidated #', consolidated.length)

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

function askForConfirmation() {
  return new Promise((resolve) => {
    const readlineInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    readlineInterface.question(
      'Do you want to reset? [yes|no] - ',
      (response) => {
        resolve(response.toLowerCase() === 'yes')
        readlineInterface.close()
      }
    )
  })
}

async function resetItem(item: FullItem, catalystItem: Wearable) {
  console.log('Item: Resetting...', item.id)

  const { name, description, contents, data } = catalystItem
  const buffersByHash = await fetchBuffersByHash(contents)
  const replaceItem = { ...item, name, description, contents, data }

  console.log('Item: Updating...')

  await new Item(toDBItem(replaceItem)).upsert()

  console.log('Item: Updated', item.id)

  console.log('Content: Uploading...')

  for (const hash in buffersByHash) {
    const buffer = buffersByHash[hash]
    const s3Content = new S3Content()
    const exists = await s3Content.checkFile(hash)

    if (exists) {
      console.log('Content already exists')
    } else {
      await new S3Content().saveFile(hash, buffer, ACL.publicRead)
    }
  }

  console.log('Content: Uploaded')

  console.log('Item: Reset', item.id)
}

async function fetchBuffersByHash(contents: Record<string, string>) {
  const hashes = Array.from(new Set(Object.values(contents)).values())

  console.log('Content: Fetching...')

  const hashAndBufferTuples = await Promise.all(
    hashes.map(async (hash) => [
      hash,
      await fetch(PEER_URL + '/content/contents/' + hash).then((res) =>
        //@ts-ignore
        res.buffer()
      ),
    ])
  )

  console.log('Content: Fetched #', hashAndBufferTuples.length)

  return hashAndBufferTuples.reduce(
    (acc, [hash, buffer]) => ({ ...acc, [hash]: buffer }),
    {} as Record<string, any>
  )
}

run()
