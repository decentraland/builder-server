import { env } from 'decentraland-commons'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { Router } from '../common/Router'

const OPEN_SEA_URL = env.get<string | undefined>('OPEN_SEA_URL')!
const OPEN_SEA_API_KEY = env.get<string | undefined>('OPEN_SEA_API_KEY')!

export class OpenSeaRouter extends Router {
  mount() {
    /**
     * Redirects the request to OpenSea with the api key header
     */
    this.router.use('/openSea', this.getProxyMiddleware())
  }

  private getProxyMiddleware() {
    return createProxyMiddleware({
      target: OPEN_SEA_URL,
      // Set the option changeOrigin to true for name-based virtual hosted sites.
      // https://en.wikipedia.org/wiki/Virtual_hosting#Name-based
      changeOrigin: true,
      pathRewrite: {
        // Remove the part of the path that is not required by the open sea api
        '^/v1/openSea': '',
      },
      onProxyReq: (req) => {
        // Add the api key required by open sea to the headers
        req.setHeader('X-API-KEY', OPEN_SEA_API_KEY)
      },
    })
  }
}
