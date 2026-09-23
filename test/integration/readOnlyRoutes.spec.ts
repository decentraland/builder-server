import supertest from 'supertest'
import { v4 as uuid } from 'uuid'
import { buildURL } from '../../spec/utils'
import { app } from '../../src/server'

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

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
]

describe('when requesting a route removed by the read-only migration', () => {
  it.each(REMOVED_ROUTES)(
    'should respond to %s %s with a 404',
    async (method, route) => {
      const path = route.replace(/:\w+/g, () => uuid())
      await server[method](buildURL(path)).expect(404)
    }
  )
})
