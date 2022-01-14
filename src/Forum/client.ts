import fetch, { Response } from 'node-fetch'
import { env } from 'decentraland-commons'
import { CreateResponse, ForumPost } from './Forum.types'

const FORUM_URL = env.get('FORUM_URL', '')
const FORUM_API_KEY = env.get('FORUM_API_KEY', '')
const FORUM_CATEGORY = env.get('FORUM_CATEGORY')

export async function createPost(post: ForumPost): Promise<string> {
  const forumPost = {
    ...post,
    title: sanitizeTitle(post.title),
    category: FORUM_CATEGORY,
  }

  const response: Response = await fetch(`${FORUM_URL}/posts.json`, {
    headers: {
      'Api-Key': FORUM_API_KEY,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    body: JSON.stringify(forumPost),
  })

  const result: CreateResponse = await response.json()

  if (result.errors !== undefined) {
    throw new Error(
      `Error creating the post ${JSON.stringify(post)}: ${result.errors.join(
        ', '
      )}`
    )
  }

  const { topic_id, topic_slug } = result
  return `${FORUM_URL}/t/${topic_slug}/${topic_id}`
}

function sanitizeTitle(title: string) {
  return removeEmojis(title)
}

export function removeEmojis(text: string) {
  return text.replace(
    /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
    ' '
  )
}
