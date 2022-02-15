import {
  EntityContentItemReference,
  EntityMetadata,
  Hashing,
} from 'dcl-catalyst-commons'
import { omit } from 'decentraland-commons/dist/utils'
import { CollectionAttributes } from '../Collection'
import { isTPCollection } from '../Collection/utils'
import { DCLCatalystItem, ItemAttributes, TPCatalystItem } from './Item.types'
import { buildTPItemURN, getDecentralandItemURN, isTPItem } from './utils'

const THUMBNAIL_PATH = 'thumbnail.png'
const IMAGE_PATH = 'image.png'

function buildItemEntityMetadata(
  item: ItemAttributes,
  collection: CollectionAttributes
): DCLCatalystItem | TPCatalystItem {
  const isTPEntity = isTPCollection(collection) && isTPItem(item)

  if (!collection.contract_address && !isTPEntity) {
    throw new Error(
      "The item's collection must be published to build its metadata"
    )
  }

  // We strip the thumbnail from the representations contents as they're not being used by the Catalyst and just occupy extra space
  const representations = item.data.representations.map((representation) => ({
    ...representation,
    contents: representation.contents.filter(
      (fileName) => fileName !== THUMBNAIL_PATH
    ),
  }))

  const itemMetadata: DCLCatalystItem = {
    id: isTPEntity
      ? buildTPItemURN(
          collection.third_party_id!,
          collection.urn_suffix!,
          item.urn_suffix!
        )
      : getDecentralandItemURN(item, collection.contract_address!),
    name: item.name,
    description: item.description,
    collectionAddress: collection.contract_address!,
    rarity: item.rarity ?? undefined,
    i18n: [{ code: 'en', text: item.name }],
    data: {
      replaces: item.data.replaces,
      hides: item.data.hides,
      tags: item.data.tags,
      category: item.data.category,
      representations,
    },
    image: IMAGE_PATH,
    thumbnail: THUMBNAIL_PATH,
    metrics: item.metrics,
  }

  if (!item.rarity) {
    delete itemMetadata.rarity
  }

  if (isTPEntity) {
    // How is the metadata for a TP item built?
    return omit(itemMetadata, ['collectionAddress'])
  }

  return itemMetadata
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
  const metadata = await buildItemEntityMetadata(item, collection)
  return calculateContentHash(content, metadata)
}
