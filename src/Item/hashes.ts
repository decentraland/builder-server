import {
  EntityContentItemReference,
  EntityMetadata,
  Hashing,
} from 'dcl-catalyst-commons'
import { CollectionAttributes } from '../Collection'
import {
  StandardWearableEntityMetadata,
  ItemAttributes,
  TPWearableEntityMetadata,
} from './Item.types'
import { buildTPItemURN, getDecentralandItemURN, isTPItem } from './utils'
import { isTPCollection } from '../Collection/utils'

const THUMBNAIL_PATH = 'thumbnail.png'
const IMAGE_PATH = 'image.png'

export function buildStandardWearableEntityMetadata(
  item: ItemAttributes,
  collection: CollectionAttributes
): StandardWearableEntityMetadata {
  if (!collection.contract_address || !item.blockchain_item_id!) {
    console.log({
      contract_address: collection.contract_address,
      blockchain_item_id: item.blockchain_item_id,
    })
    console.log({
      collection,
      item,
    })
    throw new Error(
      "The item's collection must be published to build its metadata"
    )
  }

  return {
    id: getDecentralandItemURN(item, collection.contract_address!),
    name: item.name,
    description: item.description,
    collectionAddress: collection.contract_address!,
    rarity: item.rarity!,
    i18n: [{ code: 'en', text: item.name }],
    data: {
      replaces: item.data.replaces,
      hides: item.data.hides,
      tags: item.data.tags,
      category: item.data.category,
      representations: item.data.representations,
    },
    image: IMAGE_PATH,
    thumbnail: THUMBNAIL_PATH,
    metrics: item.metrics,
  }
}

function buildTPWearableEntityMetadata(
  item: ItemAttributes,
  collection: CollectionAttributes
): TPWearableEntityMetadata {
  return {
    id: buildTPItemURN(
      collection.third_party_id!,
      collection.urn_suffix!,
      item.urn_suffix!
    ),
    name: item.name,
    description: item.description,
    i18n: [{ code: 'en', text: item.name }],
    data: {
      replaces: item.data.replaces,
      hides: item.data.hides,
      tags: item.data.tags,
      category: item.data.category,
      representations: item.data.representations,
    },
    image: IMAGE_PATH,
    thumbnail: THUMBNAIL_PATH,
    metrics: item.metrics,
  }
}

function getItemContent(item: ItemAttributes): EntityContentItemReference[] {
  return Object.keys(item.contents).map((file) => ({
    file,
    hash: item.contents[file],
  }))
}

function getItemMetadata(
  item: ItemAttributes,
  collection: CollectionAttributes
): EntityMetadata {
  let metadata: StandardWearableEntityMetadata | TPWearableEntityMetadata

  if (isTPCollection(collection) && isTPItem(item)) {
    metadata = buildTPWearableEntityMetadata(item, collection)
  } else {
    metadata = buildStandardWearableEntityMetadata(item, collection)
  }
  return metadata
}

export function toBuffer(
  item: ItemAttributes,
  collection: CollectionAttributes
): Buffer {
  const content = getItemContent(item)
  const metadata = getItemMetadata(item, collection)

  const data = JSON.stringify({
    content: content
      .sort((a: EntityContentItemReference, b: EntityContentItemReference) => {
        if (a.hash > b.hash) return 1
        else if (a.hash < b.hash) return -1
        else return a.file > b.file ? 1 : -1
      })
      .map((entry) => ({ key: entry.file, hash: entry.hash })),
    metadata,
  })
  return Buffer.from(data)
}

export function calculateItemContentHash(
  item: ItemAttributes,
  collection: CollectionAttributes
): Promise<string> {
  return Hashing.calculateIPFSHash(toBuffer(item, collection))
}
