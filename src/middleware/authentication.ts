import { Request, Response, NextFunction } from 'express'
import { AuthLink } from 'dcl-crypto'
import { env } from 'decentraland-commons'
import { server } from 'decentraland-server'
import { STATUS_CODES } from '../common/HTTPError'
import { AuthRequestLegacy } from './authentication-legacy'
import 'isomorphic-fetch'

declare const fetch: any

const AUTH_CHAIN_HEADER_PREFIX = 'x-identity-auth-chain-'
const PEER_URL = env.get('PEER_URL', 'https://peer.decentraland.org')

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

type ValidateSignatureResponse = {
  valid: boolean
  ownerAddress: string
  error?: string
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
        const body = JSON.stringify({ authChain, timestamp: endpoint }, null, 2) // we send the endpoint as the timestamp, yes
        const resp = await fetch(
          `${PEER_URL}/lambdas/crypto/validate-signature`,
          {
            method: 'post',
            headers: {
              'Content-Type': 'application/json',
            },
            body,
          }
        )
        const result = (await resp.json()) as ValidateSignatureResponse
        if (!result.valid) {
          throw new Error(result.error)
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
    if (cryptoAuthReq.auth) {
      cryptoAuthReq.authLegacy = (cryptoAuthReq as any).auth
    }
    cryptoAuthReq.auth = { ethAddress } as PermissiveAuthRequest['auth']
    next()
  }
}

export const withAuthentication = getAuthenticationMiddleware()
export const withPermissiveAuthentication = getAuthenticationMiddleware<PermissiveAuthRequest>(
  true
)
