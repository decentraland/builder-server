export type ForumPost = {
  title: string
  raw: string
  topic_id?: number
  category?: number
  archetype?: string
  created_at?: string
}

export type CreateSuccess = {
  id: number
  name: string
  username: string
  topic_id: number
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

export type UpsertPostResult = { id: number; link: string }
