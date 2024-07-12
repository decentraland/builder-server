import { calculateMultipleHashesADR32, keccak256Hash } from '@dcl/hashing'
import {
  Locale,
  Wearable,
  Emote,
  ThirdPartyProps,
  EmoteDataADR74,
} from '@dcl/schemas'
import { CollectionAttributes } from '../Collection'
import { isStandardItemPublished } from '../ItemAndCollection/utils'
import {
  getDecentralandItemURN,
  isTPCollection,
  isTPV2ItemURN,
} from '../utils/urn'
import { ItemAttributes, ItemType } from './Item.types'
import { buildTPItemURN, isTPItem, VIDEO_PATH } from './utils'

const THUMBNAIL_PATH = 'thumbnail.png'
const IMAGE_PATH = 'image.png'
const ANIMATION_EMPTY_METRICS = {
  triangles: 0,
  materials: 0,
  textures: 0,
  meshes: 0,
  bodies: 0,
  entities: 1,
}

const IGNORE_CONTENTS_FILES = [VIDEO_PATH]

function buildStandardWearableEntityMetadata(
  item: ItemAttributes,
  collection: CollectionAttributes
): Wearable {
  if (!isStandardItemPublished(item, collection)) {
    throw new Error(
      "The item's collection must be published to build its metadata"
    )
  }

  const entity: Wearable = {
    id: getDecentralandItemURN(item, collection.contract_address!),
    name: item.name,
    description: item.description,
    collectionAddress: collection.contract_address!,
    rarity: item.rarity!,
    i18n: [{ code: Locale.EN, text: item.name }],
    data: {
      replaces: item.data.replaces,
      hides: item.data.hides,
      removesDefaultHiding: item.data.removesDefaultHiding,
      tags: item.data.tags,
      category: item.data.category!,
      representations: item.data.representations,
      blockVrmExport: item.data.blockVrmExport,
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

  const data = (item.data as unknown) as EmoteDataADR74

  const entity: Emote = {
    id: getDecentralandItemURN(item, collection.contract_address!),
    name: item.name,
    description: item.description,
    collectionAddress: collection.contract_address!,
    rarity: item.rarity!,
    i18n: [{ code: Locale.EN, text: item.name }],
    emoteDataADR74: {
      category: data.category,
      representations: data.representations,
      tags: data.tags,
      loop: data.loop,
    },
    image: IMAGE_PATH,
    thumbnail: THUMBNAIL_PATH,
    metrics: ANIMATION_EMPTY_METRICS,
  }

  return entity
}

function buildTPWearableEntityMetadata(
  item: ItemAttributes,
  collection: CollectionAttributes
): Omit<Wearable, 'merkleProof'> & { content: ThirdPartyProps['content'] } {
  const id = buildTPItemURN(
    collection.third_party_id!,
    collection.urn_suffix!,
    item.urn_suffix!
  )

  return {
    id,
    name: item.name,
    description: item.description,
    i18n: [{ code: Locale.EN, text: item.name }],
    data: {
      replaces: item.data.replaces,
      hides: item.data.hides,
      removesDefaultHiding: item.data.removesDefaultHiding,
      tags: item.data.tags,
      category: item.data.category!,
      representations: item.data.representations,
      blockVrmExport: item.data.blockVrmExport,
    },
    image: IMAGE_PATH,
    thumbnail: THUMBNAIL_PATH,
    metrics: item.metrics,
    content: item.contents,
    ...(isTPV2ItemURN(id) ? { mappings: item.mappings } : {}),
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
    item.type === ItemType.EMOTE
      ? buildEmoteEntityMetadata
      : buildStandardWearableEntityMetadata
  const metadata = await buildMetadata(item, collection)
  // Skip computing the file's hash that won't be sent to the content server
  const content = Object.keys(item.contents)
    .filter((file) => !IGNORE_CONTENTS_FILES.includes(file))
    .map((file) => ({
      file,
      hash: item.contents[file],
    }))

  const { hash } = await calculateMultipleHashesADR32(content, metadata)

  return hash
}
