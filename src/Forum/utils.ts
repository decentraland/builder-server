import { env } from 'decentraland-commons'
import { CollectionAttributes } from '../Collection'
import { FullItem } from '../Item'
import { ForumPost } from './Forum.types'

const BUILDER_URL = env.get('BUILDER_URL', '')
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

function buildForumPostBody(
  collection: CollectionAttributes,
  items: FullItem[]
): ForumPost['raw'] {
  return `# ${sanitizeForumText(collection.name)}

  [View entire collection](${getItemEditorUrl({ collectionId: collection.id })})

  ## Wearables

  ${items.map(toRawItem).join('\n\n')}`
}

export function buildThirdPartyCollectionForumPost(
  collection: CollectionAttributes,
  items: FullItem[]
): ForumPost {
  return {
    title: `Third Party collection ${collection.name} with URN: ${collection.third_party_id}`,
    raw: buildForumPostBody(collection, items),
  }
}

export function buildStandardCollectionForumPost(
  collection: CollectionAttributes,
  items: FullItem[],
  createdBy: string
): Pick<ForumPost, 'title' | 'raw'> {
  return {
    title: `Collection '${collection.name}' created by ${createdBy} is ready for review!`,
    raw: buildForumPostBody(collection, items),
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
  ${newItems.map(toRawItem).join('\n\n')}
  `
}

function toRawItem(item: FullItem) {
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
      [Link to editor](${getItemEditorUrl({ itemId: item.id })})`
}

// TODO: Maybe the URL should be provided as an additional argument. That way, if the front-end path changes, this will still work
function getItemEditorUrl(params: { collectionId?: string; itemId?: string }) {
  const queryString = []

  for (const key in params) {
    const value = params[key as 'collectionId' | 'itemId']
    if (value) {
      queryString.push(`${key}=${value}`)
    }
  }

  return `${BUILDER_URL}/item-editor?${queryString.join('&')}`
}

function getThumbnailURL(item: FullItem) {
  return getContentsStorageUrl(item.contents[item.thumbnail])
}

function getContentsStorageUrl(hash: string = '') {
  return `${BUILDER_SERVER_URL}/${API_VERSION}/storage/contents/${hash}`
}
