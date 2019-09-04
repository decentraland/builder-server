import { Request, Response, NextFunction } from 'express'

export function asMiddleware(callback: Function) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let nextValue

    try {
      await callback(req, res)
    } catch (error) {
      nextValue = error
    }

    next(nextValue)
  }
}
