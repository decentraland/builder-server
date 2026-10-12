import { env } from 'decentraland-commons'
import { CollectionAttributes } from '../Collection'
import { FullItem } from '../Item'
import { ForumPost } from './Forum.types'

const BUILDER_SERVER_URL = env.get('BUILDER_SERVER_URL', '')
const API_VERSION = env.get('API_VERSION', 'v1')
const MARKDOWN_CONTROL_CHARACTERS = /[\\`*_{}[\]()<>#+\-.!|~&]/g
const MENTION_AND_LINK_TRIGGERS = /[@#:]/g
const ZERO_WIDTH_SPACE = '​'

function sanitizeForumText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(MARKDOWN_CONTROL_CHARACTERS, '\\$&')
    .replace(MENTION_AND_LINK_TRIGGERS, `$&${ZERO_WIDTH_SPACE}`)
}

type EditorUrlBuilder = (params: {
  collectionId: string
  itemId?: string
}) => string

function buildForumPostBody(
  collection: CollectionAttributes,
  items: FullItem[],
  getEditorUrl: EditorUrlBuilder
): ForumPost['raw'] {
  return `# ${sanitizeForumText(collection.name)}

  [View entire collection](${getEditorUrl({ collectionId: collection.id })})

  ## Wearables

  ${items
    .map((item) =>
      toRawItem(
        item,
        getEditorUrl({ collectionId: collection.id, itemId: item.id })
      )
    )
    .join('\n\n')}`
}

export function buildThirdPartyCollectionForumPost(
  collection: CollectionAttributes,
  items: FullItem[]
): ForumPost {
  return {
    title: `Third Party collection ${collection.name} with URN: ${collection.third_party_id}`,
    raw: buildForumPostBody(collection, items, getLegacyItemEditorUrl),
  }
}

export function buildStandardCollectionForumPost(
  collection: CollectionAttributes,
  items: FullItem[],
  createdBy: string
): Pick<ForumPost, 'title' | 'raw'> {
  return {
    title: `Collection '${collection.name}' created by ${createdBy} is ready for review!`,
    raw: buildForumPostBody(collection, items, getStandardItemEditorUrl),
  }
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function buildCollectionForumUpdateReply(
  oldPost: ForumPost['raw'],
  newItems: FullItem[]
): ForumPost['raw'] {
  // We only post in English
  return `
  ${oldPost}
  \n\n
## New wearables updated at ${new Date().toLocaleDateString()}
  ${newItems
    .map((item) =>
      toRawItem(
        item,
        getLegacyItemEditorUrl({
          collectionId: item.collection_id ?? undefined,
          itemId: item.id,
        })
      )
    )
    .join('\n\n')}
  `
}

function toRawItem(item: FullItem, editorUrl: string) {
  const sections = []
  if (item.description) {
    sections.push(`- Description: ${sanitizeForumText(item.description)}`)
  }
  if (item.rarity) {
    sections.push(`- Rarity: ${item.rarity}`)
  }
  if (item.data.category) {
    sections.push(`- Category: ${item.data.category}`)
  }
  return `**${sanitizeForumText(item.name)}**
      ${sections.join('\n')}
      ![](${getThumbnailURL(item)})
      [Link to editor](${editorUrl})`
}

// Third-party collections can only be curated in the legacy Builder, which reads `collection` and `item`.
function getLegacyItemEditorUrl(params: {
  collectionId?: string
  itemId?: string
}): string {
  const query = new URLSearchParams()
  if (params.collectionId) query.set('collection', params.collectionId)
  if (params.itemId) query.set('item', params.itemId)
  return `${getBaseUrl('BUILDER_URL')}/item-editor?${query.toString()}`
}

function getStandardItemEditorUrl(params: {
  collectionId: string
  itemId?: string
}): string {
  const creatorsUrl = getBaseUrl('CREATORS_URL')
  if (!creatorsUrl) {
    return getLegacyItemEditorUrl(params)
  }
  const query = new URLSearchParams({ collection: params.collectionId })
  if (params.itemId) query.set('item', params.itemId)
  query.set('reviewing', 'true')
  return `${creatorsUrl}/collections/editor?${query.toString()}`
}

function getBaseUrl(key: string): string {
  return env.get(key, '').replace(/\/+$/, '')
}

function getThumbnailURL(item: FullItem) {
  return getContentsStorageUrl(item.contents[item.thumbnail])
}

function getContentsStorageUrl(hash: string = '') {
  return `${BUILDER_SERVER_URL}/${API_VERSION}/storage/contents/${hash}`
}
