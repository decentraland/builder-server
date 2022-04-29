export type ForumPost = {
  title: string
  raw: string
  topic_id?: number
  category?: number
  archetype?: string
  created_at?: string
}

export type ForumNewPost = Omit<ForumPost, 'topic_id' | 'title'> & {
  title?: string // for new posts on a topic, the title is not mandatory
  topic_id: string
}

export type CreateSuccess = {
  id: number
  name: string
  username: string
  topic_id: string
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

export type CreateResponse = CreateSuccess | CreateError

export const forumPostSchema = Object.freeze({
  type: 'object',
  properties: {
    title: { type: 'string' },
    raw: { type: 'string' },
    topic_id: { type: 'number' },
    category: { type: 'number' },
    archetype: { type: 'string' },
    created_at: { type: 'string' },
  },
  additionalProperties: false,
  required: ['title', 'raw'],
})
