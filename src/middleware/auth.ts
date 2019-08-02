import { Request, Response, NextFunction } from 'express'
import jwt from 'express-jwt'
import jwksRsa from 'jwks-rsa'
import { env } from 'decentraland-commons'
import { server } from 'decentraland-server'
import { Project } from '../Project'

export type AuthRequest = Request & {
  auth: Record<string, string | number | boolean> & {
    sub: string
  }
}

export function getAuthenticationMiddleware() {
  const auth0Domain = env.get('AUTH0_DOMAIN')

  if (!auth0Domain) {
    console.log('Auth0 domain is missing, authentication disabled')
    return (req: Request, _: Response, next: NextFunction) => {
      const authRequest = req as AuthRequest
      authRequest.auth = { sub: 'fakeUserId' }
      next()
    }
  }

  const jwtMiddleware = jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${auth0Domain}/.well-known/jwks.json`
    }),
    requestProperty: 'auth',
    issuer: `https://${auth0Domain}/`,
    algorithms: ['RS256']
  })

  return (req: Request, res: Response, next: NextFunction) => {
    jwtMiddleware(req, res, err => {
      if (err && err.name === 'UnauthorizedError') {
        console.log(err.message)
        res
          .status(err.status)
          .end(JSON.stringify({ ok: false, error: 'Unauthenticated' }))
        return
      }
      next(err)
    })
  }
}

export function getAuthorizationMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = server.extractFromReq(req, 'id')
    const user_id = (req as AuthRequest).auth.sub

    if (!(await Project.exists(id))) {
      res.status(404).end(JSON.stringify({ ok: false, error: 'Not found' }))
      return
    }

    if (!(await Project.isOwnedBy(id, user_id))) {
      res.status(401).end(JSON.stringify({ ok: false, error: 'Unauthorized' }))
      return
    }

    next()
  }
}

export const authn = getAuthenticationMiddleware()
export const authz = getAuthorizationMiddleware()
