import { calculateMultipleHashesADR32, keccak256Hash } from '@dcl/hashing'
import {
  Locale,
  Wearable,
  Emote,
  EmoteCategory,
  ThirdPartyProps,
} from '@dcl/schemas'
import { CollectionAttributes } from '../Collection'
import { isStandardItemPublished } from '../ItemAndCollection/utils'
import { getDecentralandItemURN, isTPCollection } from '../utils/urn'
import { ItemAttributes, ItemType } from './Item.types'
import { buildTPItemURN, isTPItem } from './utils'

const THUMBNAIL_PATH = 'thumbnail.png'
const IMAGE_PATH = 'image.png'

function buildStandardWearableEntityMetadata(
  item: ItemAttributes,
  collection: CollectionAttributes
): Wearable & { emoteDataV0?: { loop: boolean } } {
  if (!isStandardItemPublished(item, collection)) {
    throw new Error(
      "The item's collection must be published to build its metadata"
    )
  }

  const entity: Wearable & { emoteDataV0?: { loop: boolean } } = {
    id: getDecentralandItemURN(item, collection.contract_address!),
    name: item.name,
    description: item.description,
    collectionAddress: collection.contract_address!,
    rarity: item.rarity!,
    i18n: [{ code: Locale.EN, text: item.name }],
    data: {
      replaces: item.data.replaces,
      hides: item.data.hides,
      tags: item.data.tags,
      category: item.data.category!,
      representations: item.data.representations,
    },
    image: IMAGE_PATH,
    thumbnail: THUMBNAIL_PATH,
    metrics: item.metrics,
  }

  return entity
}

function buildEmoteEntityMetadata(
  item: ItemAttributes,
  collection: CollectionAttributes
): Emote {
  if (!isStandardItemPublished(item, collection)) {
    throw new Error(
      "The item's collection must be published to build its metadata"
    )
  }

  const entity: Emote = {
    id: getDecentralandItemURN(item, collection.contract_address!),
    name: item.name,
    description: item.description,
    collectionAddress: collection.contract_address!,
    rarity: item.rarity!,
    i18n: [{ code: Locale.EN, text: item.name }],
    emoteDataADR74: {
      category: EmoteCategory.DANCE,
      representations: item.data.representations,
      tags: item.data.tags,
      loop: false,
    },
    image: IMAGE_PATH,
    thumbnail: THUMBNAIL_PATH,
    metrics: item.metrics,
  }

  return entity
}

function buildTPWearableEntityMetadata(
  item: ItemAttributes,
  collection: CollectionAttributes
): Omit<Wearable, 'merkleProof'> & { content: ThirdPartyProps['content'] } {
  return {
    id: buildTPItemURN(
      collection.third_party_id!,
      collection.urn_suffix!,
      item.urn_suffix!
    ),
    name: item.name,
    description: item.description,
    i18n: [{ code: Locale.EN, text: item.name }],
    data: {
      replaces: item.data.replaces,
      hides: item.data.hides,
      tags: item.data.tags,
      category: item.data.category!,
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
  const buildMetadata =
    item.type === ItemType.WEARABLE
      ? buildStandardWearableEntityMetadata
      : buildEmoteEntityMetadata
  const metadata = await buildMetadata(item, collection)
  const content = Object.keys(item.contents).map((file) => ({
    file,
    hash: item.contents[file],
  }))
  const { hash } = await calculateMultipleHashesADR32(content, metadata)

  return hash
}
