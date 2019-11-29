export type PoolLikeAttributes = {
  pool: string
  user: string
  created_at: string
}

export const poolSchema = {
  type: 'object',
  properties: {
    pool: {
      type: 'string',
      format: 'uuid'
    },
    user: {
      type: 'string'
    },
    created_at: {
      type: 'string',
      format: 'date-time'
    }
  }
}
