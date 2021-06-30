import fetch, { Response } from 'node-fetch'
import { env } from 'decentraland-commons'
import { CreateResponse, ForumPost } from './Forum.types'

const FORUM_URL = env.get('FORUM_URL', '')
const FORUM_API_KEY = env.get('FORUM_API_KEY', '')
const FORUM_CATEGORY = env.get('FORUM_CATEGORY')

export async function createPost(post: ForumPost): Promise<string> {
  const forumPost = { ...post, category: FORUM_CATEGORY }
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
