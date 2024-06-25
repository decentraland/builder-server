import { Request, Response, NextFunction } from 'express'
import { env } from 'decentraland-commons'
import { AuthLink, Authenticator } from '@dcl/crypto'
import { verify } from '@dcl/platform-crypto-middleware'
import { isEIP1664AuthChain } from '@dcl/platform-crypto-middleware/dist/verify'
import { server } from 'decentraland-server'
import { STATUS_CODES } from '../common/HTTPError'
import { isErrorWithMessage } from '../utils/errors'
import { peerAPI } from '../ethereum/api/peer'

const API_VERSION = env.get('API_VERSION', 'v1')
export const AUTH_CHAIN_HEADER_PREFIX = 'x-identity-auth-chain-'
export const MISSING_ETH_ADDRESS_ERROR = 'Missing ETH address in auth chain'
export const INVALID_AUTH_CHAIN_MESSAGE = 'Invalid auth chain'

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
    errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown'
  }

  if (errorMessage && !isPermissive) {
    res
      .status(STATUS_CODES.unauthorized)
      .json(server.sendError({ message: errorMessage }, 'Unauthenticated'))
  } else {
    const cryptoAuthReq = req as T
    const auth: PermissiveAuthRequest['auth'] = { ethAddress }
    cryptoAuthReq.auth = auth
    next()
  }
}

export async function decodeAuthChain(req: Request): Promise<string> {
  const authChain = buildAuthChain(req)
  let ethAddress: string | null = null
  let errorMessage: string | null = null

  if (!Authenticator.isValidAuthChain(authChain)) {
    errorMessage = INVALID_AUTH_CHAIN_MESSAGE
  } else {
    ethAddress = Authenticator.ownerAddress(authChain)

    if (!ethAddress) {
      errorMessage = MISSING_ETH_ADDRESS_ERROR
    } else {
      try {
        const data = await verify(
          req.method,
          `/${API_VERSION}${req.path}`,
          req.headers,
          {
            fetcher: peerAPI.signatureFetcher,
            expiration: 1000 * 60 * 30, // 30 minutes
          }
        )

        if (
          data.authMetadata &&
          typeof data.authMetadata === 'object' &&
          'signer' in data.authMetadata &&
          data.authMetadata.signer === 'decentraland-kernel-scene'
        ) {
          errorMessage = 'Invalid signature'
        }
      } catch (error) {
        errorMessage = isErrorWithMessage(error)
          ? `"verify" method failed with error: ${error.message}`
          : 'Unknown'
        try {
          await validateSignature(req, authChain)
          errorMessage = null // clear error if it has success
        } catch (error) {
          errorMessage = `${errorMessage}.
          "validateSignature" method failed with error: ${
            isErrorWithMessage(error) ? error.message : 'Unknown'
          }`
        }
      }
    }
  }

  if (errorMessage) {
    throw new Error(errorMessage)
  }

  return ethAddress!.toLowerCase()
}

/**
 * @deprecated use `verify` from '@dcl/platform-crypto-middleware', this function is mantained for retro-compatibility, but after we remove all the uses from the front-end should be removed
 * returns error message
 */
async function validateSignature(req: Request, authChain: AuthLink[]) {
  // TODO: We are waiting for the final implementation of https://github.com/decentraland/decentraland-crypto-middleware in order to complete use it.
  // For the time being, we need to reduce the number of request to the catalysts
  const endpoint = (req.method + ':' + req.path).toLowerCase()
  if (isEIP1664AuthChain(authChain)) {
    // We don't use the response, just want to make sure it does not blow up
    await peerAPI.validateSignature({ authChain, timestamp: endpoint }) // We send the endpoint as the timestamp, yes
  } else {
    const res = await Authenticator.validateSignature(
      endpoint,
      authChain,
      null as any,
      Date.now()
    )

    if (!res.ok) {
      throw new Error(res.message)
    }
  }
}

export const withAuthentication = getAuthenticationMiddleware()
export const withPermissiveAuthentication = getAuthenticationMiddleware<PermissiveAuthRequest>(
  true
)
