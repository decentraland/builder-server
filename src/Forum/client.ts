import fetch, { Response } from 'node-fetch'
import { env } from 'decentraland-commons'
import {
  CreateResponse,
  CreateSuccess,
  ForumPost,
  UpsertPostResult,
} from './Forum.types'

const FORUM_URL = env.get('FORUM_URL', '')
const FORUM_API_KEY = env.get('FORUM_API_KEY', '')
const FORUM_API_USERNAME = env.get('FORUM_API_USERNAME', '')
const FORUM_CATEGORY = env.get('FORUM_CATEGORY')

const postLink = ({ topic_slug, topic_id }: CreateSuccess) =>
  `${FORUM_URL}/t/${topic_slug}/${topic_id}`

async function readForumResponse(response: Response): Promise<CreateResponse> {
  const body = await response.text()
  try {
    return JSON.parse(body)
  } catch {
    return {
      action: 'error',
      errors: [body.slice(0, 200) || response.statusText],
    }
  }
}

export async function createPost(
  post: Pick<ForumPost, 'title' | 'raw'>
): Promise<UpsertPostResult> {
  const forumPost = {
    title: sanitizeTitle(post.title),
    raw: post.raw,
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

  const result = await readForumResponse(response)

  if (!response.ok || result.errors !== undefined) {
    throw new Error(
      `Error creating the post ${JSON.stringify(post)}: ${
        result.errors?.join(', ') ?? response.statusText
      }`
    )
  }

  return { id: result.id, link: postLink(result) }
}

export async function createAssigneeEventPost(
  topicId: number,
  raw: string
): Promise<void> {
  const response: Response = await fetch(`${FORUM_URL}/posts.json`, {
    headers: {
      'Api-Key': FORUM_API_KEY,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    body: JSON.stringify({ topic_id: topicId, raw }),
  })

  const result = await readForumResponse(response)

  if (!response.ok || result.errors !== undefined) {
    throw new Error(
      `Error creating the assignee post for topic ${topicId}: ${
        result.errors?.join(', ') ?? response.statusText
      }`
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

  if (!response.ok) {
    throw new Error(`Error fetching the post ${id}: ${response.statusText}`)
  }

  const result: ForumPost = await response.json()
  return result
}

export async function updatePost(
  id: number,
  rawPost: ForumPost['raw']
): Promise<UpsertPostResult> {
  const response: Response = await fetch(`${FORUM_URL}/posts/${id}.json`, {
    headers: {
      'Api-Key': FORUM_API_KEY,
      'Api-Username': FORUM_API_USERNAME,
      'Content-Type': 'application/json',
    },
    method: 'PUT',
    body: JSON.stringify({ raw: rawPost }),
  })

  const result = await readForumResponse(response)

  if (!response.ok || result.errors !== undefined) {
    throw new Error(
      `Error updating the post ${JSON.stringify(id)}: ${
        result.errors?.join(', ') ?? response.statusText
      }`
    )
  }

  return { id, link: postLink(result) }
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
