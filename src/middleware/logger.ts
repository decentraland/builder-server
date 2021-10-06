import morgan = require('morgan')
import express from 'express'
import { AuthRequest } from './authentication'

morgan.token('eth-address', (req) => {
  const authRequest = req as AuthRequest
  return authRequest.auth && authRequest.auth.ethAddress
    ? authRequest.auth.ethAddress
    : 'unauthenticated'
})

export function withLogger() {
  if (process.env.NODE_ENV === 'test') {
    return (_1: unknown, _2: unknown, next: express.NextFunction) => next()
  }

  return morgan(
    ':remote-addr :remote-user :method :url HTTP/:http-version :status :res[content-length] - :eth-address - :response-time ms'
  )
}
