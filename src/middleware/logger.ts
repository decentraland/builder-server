import morgan = require('morgan')
import { AuthRequest } from './authentication'

morgan.token('eth-address', req => {
  const authRequest = req as AuthRequest
  return authRequest.auth && authRequest.auth.ethAddress
    ? authRequest.auth.ethAddress
    : 'unauthenticated'
})

export function withLogger() {
  return morgan(
    ':remote-addr :remote-user :method :url HTTP/:http-version :status :res[content-length] - :eth-address - :response-time ms'
  )
}
