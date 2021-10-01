import { sendError } from 'decentraland-server/dist/server'
import express from 'express'
import { HTTPError } from './HTTPError'

export function errorHandler(
  error: Error,
  _: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  // If for some reasons, the headers have already been sent, handle
  // the error with the default error handler
  if (res.headersSent) {
    return next(error)
  }

  const data = (error as HTTPError).data ?? {}
  const message = error.message
  const statusCode = (error as HTTPError).statusCode ?? 500

  res.status(statusCode)
  res.json(sendError(data, message))
}
