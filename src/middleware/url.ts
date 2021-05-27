import { Request, Response, NextFunction } from 'express'

/**
 * Lowercase a set of URL params before hitting the handler.
 * It'll lowercase ALL params if the `params` argument is not supplied
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
