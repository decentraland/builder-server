import fetch, { Response } from 'node-fetch'
import { env } from 'decentraland-commons'
import { CreateResponse, ForumNewPost, ForumPost } from './Forum.types'

const FORUM_URL = env.get('FORUM_URL', '')
const FORUM_API_KEY = env.get('FORUM_API_KEY', '')
const FORUM_API_USERNAME = env.get('FORUM_API_USERNAME', '')
const FORUM_CATEGORY = env.get('FORUM_CATEGORY')

export async function createPost(
  post: ForumPost
): Promise<{ id: number; link: string }> {
  const forumPost = {
    ...post,
    title: sanitizeTitle(post.title!),
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

  const { id, topic_id, topic_slug } = result
  return { id, link: `${FORUM_URL}/t/${topic_slug}/${topic_id}` }
}

export async function createAssigneeEventPost(
  forumPost: ForumNewPost
): Promise<void> {
  console.log('in here')
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
      `Error creating the post ${JSON.stringify(
        forumPost
      )}: ${result.errors.join(', ')}`
    )
  }
}

export async function getPost(id: number): Promise<ForumPost> {
  const response: Response = await fetch(`${FORUM_URL}/posts/${id}.json`, {
    headers: {
      'Api-Key': FORUM_API_KEY,
      'Api-Username': FORUM_API_USERNAME,
      'Content-Type': 'application/json',
    },
  })

  const result: ForumPost = await response.json()
  return result
}

export async function updatePost(id: number, rawPost: ForumPost['raw']) {
  const response: Response = await fetch(`${FORUM_URL}/posts/${id}.json`, {
    headers: {
      'Api-Key': FORUM_API_KEY,
      'Api-Username': FORUM_API_USERNAME,
      'Content-Type': 'application/json',
    },
    method: 'PUT',
    body: JSON.stringify({ raw: rawPost }),
  })

  const result: CreateResponse = await response.json()

  if (result.errors !== undefined) {
    throw new Error(
      `Error updating the post ${JSON.stringify(id)}: ${result.errors.join(
        ', '
      )}`
    )
  }
}

function sanitizeTitle(title: string) {
  return removeEmojis(title)
}

export function removeEmojis(text: string) {
  return text.replace(
    /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
    ''
  )
}
