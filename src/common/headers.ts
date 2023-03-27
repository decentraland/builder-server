import { Response } from 'express'

const DEFAULT_CACHE_CONTROL = 'public,max-age=31536000,immutable'

export function addInmutableCacheControlHeader(res: Response): void {
  res.setHeader('Cache-Control', DEFAULT_CACHE_CONTROL)
}

/* Adds a custom public,max-age,s-maxage header to the Response object */
export function addCustomMaxAgeCacheControlHeader(
  res: Response,
  maxAge: number
): void {
  res.setHeader('Cache-Control', `public,max-age=${maxAge},s-maxage=${maxAge}`)
}
