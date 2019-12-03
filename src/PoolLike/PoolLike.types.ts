export type PoolLikeAttributes = {
  pool_id: string
  user_id: string
  created_at: string
}

export type PoolLikeCount = {
  pool_id: string
  user_id?: string
}

export const poolLikeSchema = {
  type: 'object',
  properties: {
    pool: {
      type: 'string',
      format: 'uuid'
    },
    user: {
      type: 'string'
    }
  }
}
