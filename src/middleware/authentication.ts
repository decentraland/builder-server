import { Request, Response, NextFunction } from 'express'
import { WebsocketProvider } from 'web3x/providers/ws'
import { AuthLink, Authenticator } from 'dcl-crypto'
import { server } from 'decentraland-server'
import { STATUS_CODES } from '../common/HTTPError'

const AUTH_CHAIN_HEADER_PREFIX = 'x-identity-auth-chain-'

export type AuthRequest = Request & {
  auth: Record<string, string | number | boolean> & {
    ethAddress: string
  }
}

export type PermissiveAuthRequest = Request & {
  auth: Record<string, string | number | boolean> & {
    ethAddress: string | null
  }
}

function extractIndex(header: string) {
  return parseInt(header.substring(AUTH_CHAIN_HEADER_PREFIX.length), 10)
}

function buildAuthChain(req: Request) {
  return Object.keys(req.headers)
    .filter(header => header.includes(AUTH_CHAIN_HEADER_PREFIX))
    .sort((a, b) => (extractIndex(a) > extractIndex(b) ? 1 : -1))
    .map(header => JSON.parse(req.headers[header] as string) as AuthLink)
}

const provider = new WebsocketProvider('wss://mainnet.infura.io/ws')

const getAuthenticationMiddleware = <
  T extends AuthRequest | PermissiveAuthRequest = AuthRequest
>(
  isPermissive = false
) => async (req: Request, res: Response, next: NextFunction) => {
  const authChain = buildAuthChain(req)
  let ethAddress: string | null = null
  let errorMessage = null
  if (authChain.length === 0) {
    errorMessage = `Invalid auth chain`
  } else {
    ethAddress = authChain[0].payload
    if (!ethAddress) {
      errorMessage = 'Missing ETH address in auth chain'
    } else {
      try {
        const endpoint = (req.method + ':' + req.url).toLowerCase()
        const result = await Authenticator.validateSignature(
          endpoint,
          authChain,
          provider
        )
        if (!result.ok) {
          throw new Error(result.message)
        }
      } catch (error) {
        errorMessage = error.message
      }
    }
  }

  if (errorMessage && !isPermissive) {
    res
      .status(STATUS_CODES.unauthorized)
      .json(server.sendError({ message: errorMessage }, 'Unauthenticated'))
  } else {
    const cryptoAuthReq = req as T
    cryptoAuthReq.auth = { ethAddress } as PermissiveAuthRequest['auth']
    next()
  }
}

export const withAuthentication = getAuthenticationMiddleware()
export const withPermissiveAuthentication = getAuthenticationMiddleware<
  PermissiveAuthRequest
>(true)
