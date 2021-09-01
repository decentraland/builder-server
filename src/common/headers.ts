import { Response } from 'express'

const DEFAULT_CACHE_CONTROL = 'public,max-age=31536000,immutable'

export function addInmutableCacheControlHeader(res: Response): void {
  res.setHeader('Cache-Control', DEFAULT_CACHE_CONTROL)
}
