import { hashV1 } from '@dcl/hashing'
import { WearableRepresentation } from '@dcl/schemas'
import { createConsoleLogComponent } from '@well-known-components/logger'
import { CatalystClient } from 'dcl-catalyst-client'
import { Entity, EntityType } from 'dcl-catalyst-commons'
import { CollectionAttributes, CollectionService } from '../src/Collection'
import {
  ItemCuration,
  ItemCurationAttributes,
} from '../src/Curation/ItemCuration'
import { db } from '../src/database'
import { Bridge } from '../src/ethereum/api/Bridge'
import { collectionAPI } from '../src/ethereum/api/collection'
import { CatalystItem, PEER_URL } from '../src/ethereum/api/peer'
import { FullItem, Item, ItemAttributes } from '../src/Item'
import { calculateItemContentHash } from '../src/Item/hashes'
import { ItemService } from '../src/Item/Item.service'
import { toDBItem } from '../src/Item/utils'
import { isStandardItemPublished } from '../src/ItemAndCollection/utils'
import { ACL, S3Content } from '../src/S3'
import { logExecutionTime } from '../src/utils/logging'
import { isTPCollection } from '../src/utils/urn'

const catalystClient = new CatalystClient({ catalystUrl: PEER_URL })
const collectionService = new CollectionService()
const itemService = new ItemService()

const entityFetchLogger = createConsoleLogComponent().getLogger('Entity Fetch')

const s3 = new S3Content()

export async function run() {
  console.log('DB: Connecting...')

  const connection = await db.connect()

  console.log('DB: Connected!')

  try {
    // Objective get all published items that are
    // de-synced with the catalyst (or that are not in the catalyst)

    // Get all items from DB
    const {
      items: standardDBItems,
      tpItems: thirdPartyDBItems,
    } = await getDbItems()

    // Get all items from subgraph
    const remoteItems = await getRemoteItems()
    // Consolidate into full items
    const standardItems = await Bridge.consolidateItems(
      standardDBItems,
      remoteItems
    )
    console.log('Standard items #', standardItems.length)

    // Get item curations
    const curations = await ItemCuration.find<ItemCurationAttributes>()
    // Consolidate into full items
    const thirdPartyItems = await Bridge.consolidateTPItems(
      thirdPartyDBItems,
      curations
    )

    console.log('Third party items #', thirdPartyItems.length)

    // merge items
    const items = [...standardItems, ...thirdPartyItems].filter(
      (item) => !!item.collection_id
    ) // ignore orphan items
    console.log('all items (without orphans) #', items.length)

    // Grab URNs
    const urns = items.filter((item) => !!item.urn).map((item) => item.urn!)
    console.log('urns #', urns.length)
    console.log(
      'urns # collections-v2',
      urns.filter((urn) => urn.includes('collections-v2')).length
    )
    console.log(
      'urns # collections-thirdparty',
      urns.filter((urn) => urn.includes('collections-thirdparty')).length
    )

    // Fetch entities from catalyst
    const entities = await getEntities(urns)
    const entitiesByURN = entities.reduce((obj, entity) => {
      const item = entity.metadata as CatalystItem
      obj[item.id] = entity
      return obj
    }, {} as Record<string, Entity>)

    // Filter items that dont have an entity or that are unsynced
    let notInCatalyst = 0
    let unsyncedCount = 0
    const itemsToMigrate = items.filter((item) => {
      if (!item.urn) {
        return false
      }
      const entity = entitiesByURN[item.urn]
      if (!entity) {
        notInCatalyst++
        return true
      }
      const isSynced = areSynced(item, entity)
      if (!isSynced) {
        unsyncedCount++
        return true
      }
      return false
    })
    console.log('Items not in catalyst', notInCatalyst)
    console.log('Items unsynced', unsyncedCount)
    console.log('Items to migrate #', itemsToMigrate.length)

    for (let i = 0; i < itemsToMigrate.length; i++) {
      const item = itemsToMigrate[i]
      console.log(
        `[${i + 1}/${itemsToMigrate.length}] Migrating... ${item.name} ${
          item.urn
        }`
      )
      if (needsMigration(item)) {
        try {
          await migrateItem(item)
        } catch (error) {
          console.error('Error:', error.message)
        }
      } else {
        console.log('Already migrated, skipped...')
      }
    }
  } catch (error) {
    console.error(error)
  } finally {
    connection.end()
  }
}

function needsMigration(item: FullItem) {
  return (
    Object.values(item.contents).some((hash) => hash.startsWith('Qm')) ||
    (item.local_content_hash && item.local_content_hash.startsWith('Qm'))
  )
}

async function migrateItem(item: FullItem) {
  const files: Record<string, Buffer> = {}

  console.log('Downloading files...')
  const filePromises: Promise<any>[] = []
  for (const path in item.contents) {
    const hash = item.contents[path]
    const promise = s3.readFile(hash).then((file) => {
      if (file && file.Body) {
        const buffer = file.Body
        files[path] = buffer as Buffer
      }
    })
    filePromises.push(promise)
  }
  await Promise.all(filePromises)

  // generate new content with hashV1
  console.log('Re-hashing...')
  const newContent: Record<string, string> = {}
  const hashPromises: Promise<any>[] = []
  for (const path in item.contents) {
    const promise = hashV1(files[path]).then(
      (hash) => (newContent[path] = hash)
    )
    hashPromises.push(promise)
  }
  await Promise.all(hashPromises)

  // upload files
  console.log('Copying files with new hash...')
  let copyPromises: Promise<any>[] = []
  for (const path in newContent) {
    const oldHash = item.contents[path]
    const newHash = newContent[path]
    const promise = s3.copyFile(oldHash, newHash, ACL.publicRead)
    copyPromises.push(promise)
  }
  try {
    await Promise.all(copyPromises)
  } catch (error) {
    const alreadyCopied = error.message.includes('This copy request is illegal')
    if (alreadyCopied) {
      console.log('Files already copied, skipped...')
    } else {
      throw error
    }
  }

  // update item
  const newItem: FullItem = {
    ...item,
    contents: newContent,
  }
  const collection = await collectionService.getDBCollection(
    newItem.collection_id!
  )

  console.log('Updating DB with new hashes...')
  if (collection) {
    if (isTPCollection(collection)) {
      await migrateTPItem(newItem, collection)
    } else {
      await migrateStandardItem(newItem, collection)
    }
  } else {
    console.error(`Collection not found for id="${newItem.collection_id}"`)
  }

  console.log('Done!')
}

async function migrateStandardItem(
  item: FullItem,
  collection: CollectionAttributes
) {
  const attributes = toDBItem(item)
  attributes.blockchain_item_id = item ? item.blockchain_item_id : null
  // Compute the content hash of the item to later store it in the DB
  attributes.local_content_hash =
    collection && isStandardItemPublished(attributes, collection)
      ? await calculateItemContentHash(attributes, collection)
      : null
  return Item.upsert(attributes)
}

async function migrateTPItem(item: FullItem, collection: CollectionAttributes) {
  const attributes = toDBItem(item)

  attributes.local_content_hash = await calculateItemContentHash(
    attributes,
    collection
  )

  const newFullItem = await Item.upsert(attributes)

  const itemCuration = await ItemCuration.findLastByCollectionId(
    newFullItem.collection_id!
  )
  if (itemCuration && newFullItem.local_content_hash) {
    console.log('Update curation for item=', item.urn)
    const newItemCuration: ItemCurationAttributes = {
      ...itemCuration,
      content_hash: newFullItem.local_content_hash,
    }
    await ItemCuration.upsert(newItemCuration)
  }
}

/***************************************************************************************
 Helpers to fetch item data from different sources
***************************************************************************************/

async function getDbItems() {
  console.log('DB Items: Fetching...')

  const items = await Item.find<ItemAttributes>()

  console.log('DB Items: Fetched #', items.length)

  return itemService.splitItems(items)
}

async function getRemoteItems() {
  console.log('Remote Items: Fetching...')

  const items = await collectionAPI.fetchItems()

  console.log('Remote Items: Fetched #', items.length)

  return items
}

async function getEntities(urns: string[]) {
  console.log('Entities: Fetching...')

  const entities = await logExecutionTime(
    () => catalystClient.fetchEntitiesByPointers(EntityType.WEARABLE, urns),
    entityFetchLogger,
    'Fetching Entities'
  )

  console.log('Entities: Fetching #', entities.length)

  return entities
}

/***************************************************************************************
 Helpers to check if an item is synced with its corresponding entity
***************************************************************************************/

export function areSynced(item: FullItem, entity: Entity) {
  // check if metadata is synced
  const catalystItem = entity.metadata! as CatalystItem
  if (item.name !== catalystItem.name) {
    return false
  }
  if (item.description !== catalystItem.description) {
    return false
  }
  if (item.data.category !== catalystItem.data.category) {
    return false
  }
  if (
    (item.data.hides || []).toString() !==
    (catalystItem.data.hides || []).toString()
  ) {
    return false
  }
  if (
    (item.data.replaces || []).toString() !==
    (catalystItem.data.replaces || []).toString()
  ) {
    return false
  }
  if (
    (item.data.tags || []).toString() !==
    (catalystItem.data.tags || []).toString()
  ) {
    return false
  }

  // check if representations are synced
  if (
    !areEqualRepresentations(
      item.data.representations,
      catalystItem.data.representations
    )
  ) {
    return false
  }

  // check if contents are synced
  const contents = entity.content!.reduce(
    (map, entry) => map.set(entry.file, entry.hash),
    new Map<string, string>()
  )
  for (const path in item.contents) {
    const hash = item.contents[path]
    if (contents.get(path) !== hash) {
      return false
    }
  }

  return true
}

function areEqualRepresentations(
  a: WearableRepresentation[],
  b: WearableRepresentation[]
) {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    const repA = a[i]
    const repB = b[i]
    if (!areEqualArrays(repA.bodyShapes, repB.bodyShapes)) {
      return false
    }
    if (!areEqualArrays(repA.contents, repB.contents)) {
      return false
    }
    if (repA.mainFile !== repB.mainFile) {
      return false
    }

    if (
      repA.overrideHides &&
      repB.overrideHides &&
      repA.overrideReplaces &&
      repB.overrideReplaces
    ) {
      if (!areEqualArrays(repA.overrideHides, repB.overrideHides)) {
        return false
      }
      if (!areEqualArrays(repA.overrideReplaces, repB.overrideReplaces)) {
        return false
      }
    }
  }
  return true
}

function areEqualArrays<T>(a: T[], b: T[]) {
  const setA = new Set(a)
  const setB = new Set(b)
  return (
    setA.size === setB.size &&
    a.every((elemA) => setB.has(elemA)) &&
    b.every((elemB) => setA.has(elemB))
  )
}

// kick it
run().catch(console.error)
