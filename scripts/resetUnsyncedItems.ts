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
    const consolidatedItems = await consolidate(
      dbItems,
      remoteItems,
      catalystItems
    )

    const catalystItemsByUrn = catalystItems.reduce((acc, item) => {
      acc[item.id] = item
      return acc
    }, {} as Record<string, Wearable>)

    const differentItems = consolidatedItems.filter(
      (item) =>
        item.urn &&
        catalystItemsByUrn[item.urn] &&
        isDifferent(item, catalystItemsByUrn[item.urn])
    )

    if (differentItems.length === 0) {
      console.log('No items in the db are unsynced with the catalyst')
      return
    }

    const differentItemsIds = differentItems.map((item) => item.id)

    console.log('Different Items #', differentItemsIds.length)
    console.log('Different Items:', differentItemsIds)

    const shouldProceed = await askForConfirmation()

    if (!shouldProceed) {
      return
    }

    const failed = await resetItems(differentItems, catalystItemsByUrn)
    await resetItems(failed, catalystItemsByUrn)

    console.log('Different items were reset successfuly!')
  } catch (e) {
    console.error(e)
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
    !areEqualObjects(item.data, catalystItem.data)

  if (hasMetadataChanged) {
    return true
  }

  if (!areEqualObjects(item.contents, catalystItem.contents)) {
    return true
  }

  return false
}

function areEqualObjects(objA: any, objB: any) {
  return (
    JSON.stringify(objA, Object.keys(objA).sort()) ===
    JSON.stringify(objB, Object.keys(objB).sort())
  )
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

async function resetItems(
  items: FullItem[],
  catalystItemsByUrn: Record<string, Wearable>
) {
  let count = 1
  const failed = []

  for (const item of items) {
    console.log(`Reseting ${count}/${items.length}`)
    try {
      await resetItem(item, catalystItemsByUrn[item.urn!])
    } catch (e) {
      console.log('Failed to reset:', item.id)
      console.error(e)
      failed.push(item)
    }
    count++
  }

  return failed
}

async function resetItem(item: FullItem, catalystItem: Wearable) {
  console.log('Item: Resetting...', item.id)

  const { name, description, contents, data } = catalystItem
  const buffersByHash = await getBuffersByHash(contents)
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

async function getBuffersByHash(contents: Record<string, string>) {
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

  return hashAndBufferTuples.reduce((acc, [hash, buffer]) => {
    acc[hash] = buffer
    return acc
  }, {} as Record<string, any>)
}

run().catch(console.error)
