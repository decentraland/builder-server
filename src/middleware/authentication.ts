import { Request, Response, NextFunction } from 'express'
import { AuthLink } from 'dcl-crypto'
import { server } from 'decentraland-server'
import { STATUS_CODES } from '../common/HTTPError'
import { AuthRequestLegacy } from './authentication-legacy'
import { peerAPI } from '../ethereum/api/peer'

const AUTH_CHAIN_HEADER_PREFIX = 'x-identity-auth-chain-'

export type AuthRequest = Request & {
  authLegacy?: AuthRequestLegacy['auth']
  auth: Record<string, string | number | boolean> & {
    ethAddress: string
  }
}

export type PermissiveAuthRequest = Request & {
  authLegacy?: AuthRequest['auth']
  auth: Record<string, string | number | boolean> & {
    ethAddress: string | null
  }
}

function extractIndex(header: string) {
  return parseInt(header.substring(AUTH_CHAIN_HEADER_PREFIX.length), 10)
}

function buildAuthChain(req: Request) {
  return Object.keys(req.headers)
    .filter((header) => header.includes(AUTH_CHAIN_HEADER_PREFIX))
    .sort((a, b) => (extractIndex(a) > extractIndex(b) ? 1 : -1))
    .map((header) => JSON.parse(req.headers[header] as string) as AuthLink)
}

const getAuthenticationMiddleware = <
  T extends AuthRequest | PermissiveAuthRequest = AuthRequest
>(
  isPermissive = false
) => async (req: Request, res: Response, next: NextFunction) => {
  let ethAddress: string = ''
  let errorMessage: string = ''
  try {
    ethAddress = await decodeAuthChain(req)
  } catch (error) {
    errorMessage = error.message
  }

  if (errorMessage && !isPermissive) {
    res
      .status(STATUS_CODES.unauthorized)
      .json(server.sendError({ message: errorMessage }, 'Unauthenticated'))
  } else {
    const cryptoAuthReq = req as T
    if (cryptoAuthReq.auth) {
      cryptoAuthReq.authLegacy = (cryptoAuthReq as any).auth
    }
    const auth: PermissiveAuthRequest['auth'] = { ethAddress }
    cryptoAuthReq.auth = auth
    next()
  }
}

async function decodeAuthChain(req: Request): Promise<string> {
  const authChain = buildAuthChain(req)
  let ethAddress: string | null = null
  let errorMessage: string | null = null

  if (authChain.length === 0) {
    errorMessage = `Invalid auth chain`
  } else {
    ethAddress = authChain[0].payload

    if (!ethAddress) {
      errorMessage = 'Missing ETH address in auth chain'
    } else {
      try {
        const endpoint = (req.method + ':' + req.url).toLowerCase()
        // We don't use the response, just want to make sure it does not blow up
        await peerAPI.validateSignature({ authChain, timestamp: endpoint }) // We send the endpoint as the timestamp, yes
      } catch (error) {
        errorMessage = error.message
      }
    }
  }

  if (errorMessage) {
    throw new Error(errorMessage)
  }

  return ethAddress!.toLowerCase()
}

export const withAuthentication = getAuthenticationMiddleware()
export const withPermissiveAuthentication = getAuthenticationMiddleware<PermissiveAuthRequest>(
  true
)
