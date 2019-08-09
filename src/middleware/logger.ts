import morgan = require('morgan')
import { AuthRequest } from './authentication'

morgan.token('id', req => {
  const authRequest = req as AuthRequest
  return authRequest.auth ? authRequest.auth.sub : 'unauthenticated'
})

export function getLogger() {
  return morgan(
    ':remote-addr :remote-user :method :url HTTP/:http-version :status :res[content-length] - :id - :response-time ms'
  )
}
