import { Request, Response, NextFunction } from 'express'
import jwt from 'express-jwt'
import jwksRsa from 'jwks-rsa'
import { server } from 'decentraland-server'
import { env } from 'decentraland-commons'

export type AuthRequest = Request & {
  auth: Record<string, string | number | boolean> & {
    sub: string
  }
}

export function getAuthenticationMiddleware() {
  const auth0Domain = env.get('AUTH0_DOMAIN')

  if (!auth0Domain) {
    console.log('Auth0 domain is missing, using default user id')
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
        res
          .status(err.status)
          .json(server.sendError({ error: err.message }, 'Unauthenticated'))
        return
      }
      next(err)
    })
  }
}

export const authentication = getAuthenticationMiddleware()
