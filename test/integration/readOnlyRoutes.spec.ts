import supertest from 'supertest'
import { v4 as uuid } from 'uuid'
import { buildURL } from '../../spec/utils'
import { app } from '../../src/server'

type HttpMethod = 'get' | 'head' | 'post' | 'put' | 'patch' | 'delete'

const server = supertest(app.getApp())

const REMOVED_ROUTES: [HttpMethod, string][] = [
  ['put', '/assetPacks/:id'],
  ['delete', '/assetPacks/:id'],
  ['post', '/assetPacks/:id/thumbnail'],
  ['post', '/assetPacks/:assetPackId/assets/:id/files'],
  ['get', '/pools'],
  ['get', '/pools/groups'],
  ['get', '/projects/:id/pool'],
  ['put', '/projects/:id/pool'],
  ['get', '/pools/:id/likes'],
  ['put', '/pools/:id/likes'],
  ['delete', '/pools/:id/likes'],
  ['get', '/pools/:id/manifest'],
  ['get', '/share/scene/:id'],
  ['get', '/share/pool/:id'],
  ['put', '/projects/:id'],
  ['post', '/projects/:id/media'],
  ['put', '/projects/:id/crdt'],
  ['put', '/projects/:id/manifest'],
  ['put', '/projects/:id/deployment'],
  ['post', '/storage/upload'],
  ['get', '/lands/redirectionHashes'],
  ['post', '/lands/:coords/redirection'],
]

const RETAINED_ROUTES: [HttpMethod, string, number][] = [
  ['get', '/assets', 401],
  ['get', '/assets/:id', 401],
  ['get', '/storage/assetPacks/:filename', 301],
  ['get', '/projects', 401],
  ['get', '/projects/:id', 401],
  ['delete', '/projects/:id', 401],
  ['delete', '/projects/:coords/coords', 401],
  ['delete', '/projects_by_coords/:coords/coords', 401],
  ['get', '/projects/:id/media/thumbnail.png', 301],
  ['get', '/projects/:id/crdt', 401],
  ['get', '/projects/:id/manifest', 401],
  ['get', '/manifests', 401],
  ['delete', '/projects/:id/manifest', 401],
  ['get', '/deployments', 401],
  ['get', '/projects/:id/deployment', 401],
  ['delete', '/projects/:id/deployment', 401],
  ['get', '/storage/contents/:filename', 301],
  ['head', '/storage/contents/:filename', 301],
]

const toPath = (route: string) => route.replace(/:\w+/g, () => uuid())

describe('when requesting a route kept by the read-only migration without signing the request', () => {
  it.each(RETAINED_ROUTES)(
    'should respond to %s %s with a %i',
    async (method, route, status) => {
      await server[method](buildURL(toPath(route))).expect(status)
    }
  )
})

describe('when requesting a route removed by the read-only migration', () => {
  it.each(REMOVED_ROUTES)(
    'should respond to %s %s with a 404',
    async (method, route) => {
      const response = await server[method](buildURL(toPath(route))).expect(404)
      expect(response.text).toContain(`Cannot ${method.toUpperCase()}`)
    }
  )
})
