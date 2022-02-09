import {
  EntityContentItemReference,
  EntityMetadata,
  Hashing,
} from 'dcl-catalyst-commons'
import { ItemAttributes } from './Item.types'
// import { getDecentralandItemURN } from './utils'

const THUMBNAIL_PATH = 'thumbnail.png'
const IMAGE_PATH = 'image.png'

// TODO type this.
function buildDCLItemEntityMetadata(
  item: ItemAttributes,
  collectionAddress: string
): any {
  // We strip the thumbnail from the representations contents as they're not being used by the Catalyst and just occupy extra space
  const representations = item.data.representations.map((representation) => ({
    ...representation,
    contents: representation.contents.filter(
      (fileName) => fileName !== THUMBNAIL_PATH
    ),
  }))

  return {
    // id: getDecentralandItemURN(item, collectionAddress),
    // How do we know where the item comes from?
    id:
      'urn:decentraland:mumbai:collections-v2:0x6319d66715faf411f8c37a2f5858e0bce90da5ae:0',
    name: item.name,
    description: item.description,
    collectionAddress: collectionAddress,
    rarity: item.rarity,
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
}

async function calculateContentHash(
  content: EntityContentItemReference[],
  metadata: EntityMetadata
) {
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
  // Calculate buffer hash will be deprecated. This hash function produces a different hash from
  // the one that we're currently using. This is a big issue.
  return Hashing.calculateBufferHash(buffer)
  // return Hashing.calculateIPFSHash(buffer)
}

export async function calculateItemContentHash(
  item: ItemAttributes,
  collectionAddress: string
): Promise<string> {
  const content = Object.keys(item.contents).map((file) => ({
    file,
    hash: item.contents[file],
  }))
  const metadata = await buildDCLItemEntityMetadata(item, collectionAddress)
  return calculateContentHash(content, metadata)
}
