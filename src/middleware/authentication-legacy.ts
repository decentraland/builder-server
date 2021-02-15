import { Request, Response, NextFunction } from 'express'
import { default as expressJwt } from 'express-jwt'
import jwksRsa from 'jwks-rsa'
import { server } from 'decentraland-server'
import { env } from 'decentraland-commons'

const AUTH0_DOMAIN = env.get('AUTH0_DOMAIN')
if (!AUTH0_DOMAIN) {
  console.log('Auth0 domain is missing, will use default user id')
}

export type AuthRequestLegacy = Request & {
  auth: Record<string, string | number | boolean> & {
    sub: string
  }
}

export type PermissiveAuthRequestLegacy = Request & {
  auth?: Record<string, string | number | boolean> & {
    sub: string
  }
}

const jwt = getJWTMiddleware()

function getAuthenticationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) =>
    jwt(req, res, (err?: any) => {
      if (err && err.name === 'UnauthorizedError') {
        res
          .status(err.status)
          .json(server.sendError({ error: err.message }, 'Unauthenticated'))
        return
      }
      next(err)
    })
}

function getPermissiveAuthenticationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) =>
    jwt(req, res, () => next())
}

function getJWTMiddleware() {
  if (!AUTH0_DOMAIN) {
    return (req: Request, _: Response, next: NextFunction) => {
      const authRequest = req as AuthRequestLegacy
      authRequest.auth = { sub: 'fakeUserId' }
      next()
    }
  }

  return expressJwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
    }),
    requestProperty: 'auth',
    issuer: `https://${AUTH0_DOMAIN}/`,
    algorithms: ['RS256'],
  })
}

export const withPermissiveAuthenticationLegacy = getPermissiveAuthenticationMiddleware()
export const withAuthenticationLegacy = getAuthenticationMiddleware()
