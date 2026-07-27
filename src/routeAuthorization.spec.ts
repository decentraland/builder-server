import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Structural guard: every mutating collection/item/curation route must be
 * authorized — via authz middleware or an explicit HANDLER_AUTHORIZED entry.
 */
const AUTH_MIDDLEWARE = ['withCollectionAuthorization', 'withItemAuthorization']

const HANDLER_AUTHORIZED: Record<string, string> = {
  'PUT /collections/:id':
    'upsertCollection -> Ownable.canUpsert / ThirdPartyService.isManager',
  'PUT /items/:idOrURN':
    'upsertItem -> collection owner/manager & isManager in Item.service',
  'POST /collections/:id/curation':
    'insertCuration -> validateAccessToCuration',
  'PATCH /collections/:id/curation':
    'updateCuration -> validateAccessToCuration (+committee for status)',
  'POST /collections/:id/curation/post':
    'createCurationNewAssigneePost -> isCommitteeMember',
  'POST /items/:id/curation': 'insertCuration -> validateAccessToCuration',
  'PATCH /items/:id/curation': 'updateCuration -> validateAccessToCuration',
}

const ROUTERS = [
  'Collection/Collection.router.ts',
  'Item/Item.router.ts',
  'Curation/Curation.router.ts',
]

interface Route {
  method: string
  path: string
  block: string
}

function parseMutatingRoutes(source: string): Route[] {
  const routes: Route[] = []
  const re = /this\.router\.(post|put|patch|delete)\(([\s\S]*?)\n\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    const method = m[1].toUpperCase()
    const block = m[2]
    const pathMatch = block.match(/['"`]([^'"`]+)['"`]/)
    if (pathMatch) routes.push({ method, path: pathMatch[1], block })
  }
  return routes
}

function isAuthorized(route: Route): boolean {
  const hasMiddleware = AUTH_MIDDLEWARE.some((mw) => route.block.includes(mw))
  const isHandlerAuthorized =
    `${route.method} ${route.path}` in HANDLER_AUTHORIZED
  return hasMiddleware || isHandlerAuthorized
}

describe('router authorization guard', () => {
  const allRoutes = ROUTERS.flatMap((rel) =>
    parseMutatingRoutes(readFileSync(join(__dirname, rel), 'utf8'))
  )

  it('finds the mutating routes (parser sanity)', () => {
    expect(allRoutes.length).toBeGreaterThanOrEqual(12)
  })

  it('rejects a mutating route with neither middleware nor an allow-list entry', () => {
    const unguarded: Route = {
      method: 'POST',
      path: '/collections/:id/evil',
      block:
        "'/collections/:id/evil', withCors, withAuthentication, server.handleRequest(this.evil)",
    }
    expect(isAuthorized(unguarded)).toBe(false)
    expect(
      isAuthorized({
        method: 'POST',
        path: '/collections/:id/evil',
        block:
          "'/collections/:id/evil', withCollectionAuthorization, server.handleRequest(this.evil)",
      })
    ).toBe(true)
  })

  it.each(allRoutes.map((r) => [`${r.method} ${r.path}`, r]))(
    'every mutating route is authorized: %s',
    (key, route) => {
      if (!isAuthorized(route as Route)) {
        throw new Error(
          `Mutating route "${key}" has no authorization middleware and is not ` +
            `listed in HANDLER_AUTHORIZED. Add withCollectionAuthorization/` +
            `withItemAuthorization, or (if it authorizes inside the handler) add ` +
            `it to HANDLER_AUTHORIZED with its mechanism. This guard exists to ` +
            `stop the reported publish-authorization bug from recurring.`
        )
      }
      expect(isAuthorized(route as Route)).toBe(true)
    }
  )
})
