import { calculateMultipleHashesADR32, keccak256Hash } from '@dcl/hashing'
import { CollectionAttributes } from '../Collection'
import { isTPCollection } from '../Collection/utils'
import {
  StandardWearableEntityMetadata,
  ItemAttributes,
  TPWearableEntityMetadata,
} from './Item.types'
import { buildTPItemURN, getDecentralandItemURN, isTPItem } from './utils'

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
    content: item.contents,
  }
}

export async function calculateItemContentHash(
  item: ItemAttributes,
  collection: CollectionAttributes
): Promise<string> {
  if (isTPCollection(collection) && isTPItem(item)) {
    return calculateTPItemContentHash(item, collection)
  }

  return calculateStandardItemContentHash(item, collection)
}

async function calculateTPItemContentHash(
  item: ItemAttributes,
  collection: CollectionAttributes
): Promise<string> {
  const metadata = await buildTPWearableEntityMetadata(item, collection)
  return keccak256Hash(metadata, Object.keys(metadata))
}

async function calculateStandardItemContentHash(
  item: ItemAttributes,
  collection: CollectionAttributes
): Promise<string> {
  const metadata = await buildStandardWearableEntityMetadata(item, collection)
  const content = Object.keys(item.contents).map((file) => ({
    file,
    hash: item.contents[file],
  }))
  const { hash } = await calculateMultipleHashesADR32(content, metadata)

  return hash
}
