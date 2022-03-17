import {
  EntityContentItemReference,
  EntityMetadata,
  Hashing,
} from 'dcl-catalyst-commons'
import { CollectionAttributes } from '../Collection'
import { getDecentralandItemURN, isTPCollection } from '../utils/urn'
import {
  StandardWearableEntityMetadata,
  ItemAttributes,
  TPWearableEntityMetadata,
} from './Item.types'
import { buildTPItemURN, isTPItem } from './utils'

const THUMBNAIL_PATH = 'thumbnail.png'
const IMAGE_PATH = 'image.png'

export function buildStandardWearableEntityMetadata(
  item: ItemAttributes,
  collection: CollectionAttributes
): StandardWearableEntityMetadata {
  if (!collection.contract_address || !item.blockchain_item_id!) {
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

async function calculateContentHash(
  content: EntityContentItemReference[],
  metadata: EntityMetadata
) {
  // The stringify procedure doesn't ensure that the keys will always have the same order when printed.
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
  const buffer = Buffer.from(data)
  return Hashing.calculateIPFSHash(buffer)
}

export async function calculateItemContentHash(
  item: ItemAttributes,
  collection: CollectionAttributes
): Promise<string> {
  const content = Object.keys(item.contents).map((file) => ({
    file,
    hash: item.contents[file],
  }))

  let metadata: StandardWearableEntityMetadata | TPWearableEntityMetadata

  if (isTPCollection(collection) && isTPItem(item)) {
    metadata = await buildTPWearableEntityMetadata(item, collection)
  } else {
    metadata = await buildStandardWearableEntityMetadata(item, collection)
  }

  return calculateContentHash(content, metadata)
}
