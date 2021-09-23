import { Request, Response, NextFunction } from 'express'

/**
 * Lowercase a set of URL params before hitting the handler.
 * It'll lowercase ALL params if the `params` argument is not supplied
 *
 * * @param params - The URL parameters to be lowercased
 */
export function withLowercasedParams(params?: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (params) {
      for (const param of params) {
        if (param in req.params) {
          req.params[param] = req.params[param].toLowerCase()
        }
      }
    } else {
      for (const param in req.params) {
        req.params[param] = req.params[param].toLowerCase()
      }
    }
    next()
  }
}

/**
 * Lowercase a set of URL query params before hitting the handler.
 * The lowercase functionality will only be applied to string query parameters.
 * It'll lowercase ALL query params if the `params` argument is not supplied.
 *
 * @param params - The query parameters to be lowercased
 */
export function withLowercaseQueryParams(params?: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (params) {
      for (const param of params) {
        if (param in req.query && isString(req.query[param])) {
          req.query[param] = (req.query[param] as string).toLowerCase()
        }
      }
    } else {
      for (const param in Object.keys(req.query)) {
        if (isString(req.query[param])) {
          req.query[param] = (req.query[param] as string).toLowerCase()
        }
      }
    }
    next()
  }
}

const isString = (value: unknown) =>
  typeof value === 'string' || value instanceof String
