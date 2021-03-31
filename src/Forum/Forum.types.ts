export type ForumPost = {
  title: string
  raw: string
  topic_id?: number
  category?: number
  archetype?: string
  created_at?: string
}

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
