import fetch, { Response } from 'node-fetch'
import { env } from 'decentraland-commons'
import { ForumPost } from './Forum.types'

export type CreateSuccess = {
  id: number
  name: string
  username: string
  topic_slug: string
  display_username: string
  created_at: string
  cooked: string
  errors: undefined
}

export type CreateError = {
  action: string
  errors: string[]
}

type CreateResponse = CreateSuccess | CreateError

export const FORUM_URL = env.get('REACT_APP_FORUM_URL', '')
const FORUM_API_KEY = env.get('REACT_APP_FORUM_API_KEY', '')
const FORUM_CATEGORY = env.get('REACT_APP_FORUM_CATEGORY')

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

  const { id, topic_slug } = result as CreateSuccess
  return `${FORUM_URL}/t/${topic_slug}/${id}`
}
