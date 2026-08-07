import { Request, Response, NextFunction } from 'express'
import { env } from 'decentraland-commons'
import { AuthLink, Authenticator } from '@dcl/crypto'
import { AUTH_CHAIN_HEADER_PREFIX, verify } from '@dcl/crypto-middleware'
import { isEIP1654AuthChain } from '@dcl/crypto-middleware/dist/verify'
import { server } from 'decentraland-server'
import { STATUS_CODES } from '../common/HTTPError'
import { isErrorWithMessage } from '../utils/errors'
import { peerAPI } from '../ethereum/api/peer'

const API_VERSION = env.get('API_VERSION', 'v1')
export { AUTH_CHAIN_HEADER_PREFIX }
export const AUTH_METADATA_HEADER = 'x-identity-metadata'
/** The `signer` an explorer sets on an auth chain signed on a scene's behalf. */
export const SCENE_SIGNER = 'decentraland-kernel-scene'

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

/**
 * Checks for a scene signer before entering the legacy signature fallback.
 *
 * Legacy `method:path` signatures do not bind metadata, so this must read and normalize the raw
 * header rather than relying on `verify()`'s parsed result.
 */
function declaresSceneSigner(req: Request): boolean {
  const raw = req.headers[AUTH_METADATA_HEADER]
  if (typeof raw !== 'string') {
    return false
  }

  try {
    const metadata = JSON.parse(raw) as { signer?: unknown } | null
    return (
      typeof metadata?.signer === 'string' &&
      metadata.signer.trim().toLowerCase() === SCENE_SIGNER
    )
  } catch {
    return false
  }
}

export async function decodeAuthChain(req: Request): Promise<string> {
  const authChain = buildAuthChain(req)

  if (!Authenticator.isValidAuthChain(authChain)) {
    throw new Error('Invalid auth chain')
  }

  const ethAddress = Authenticator.ownerAddress(authChain)
  if (!ethAddress) {
    throw new Error('Missing ETH address in auth chain')
  }

  if (declaresSceneSigner(req)) {
    throw new Error('Invalid signature')
  }

  try {
    const data = await verify(
      req.method,
      `/${API_VERSION}${req.path}`,
      req.headers,
      {
        expiration: 1000 * 60 * 30, // 30 minutes
      }
    )

    if (data.authMetadata.signer === SCENE_SIGNER) {
      throw new Error('Invalid signature')
    }

    return data.auth
  } catch (error) {
    try {
      await validateSignature(req, authChain)
      return ethAddress.toLowerCase()
    } catch (fallbackError) {
      const verifyError = isErrorWithMessage(error) ? error.message : 'Unknown'
      const legacyError = isErrorWithMessage(fallbackError)
        ? fallbackError.message
        : 'Unknown'
      throw new Error(
        `"verify" method failed with error: ${verifyError}. ` +
          `"validateSignature" method failed with error: ${legacyError}`
      )
    }
  }
}

/**
 * Temporary compatibility path for clients that still sign the deprecated `method:path` payload.
 * Remove once all callers have moved to ADR-44 signed requests.
 */
async function validateSignature(req: Request, authChain: AuthLink[]) {
  const endpoint = (req.method + ':' + req.path).toLowerCase()
  if (isEIP1654AuthChain(authChain)) {
    await peerAPI.validateSignature({ authChain, timestamp: endpoint })
    return
  }

  const result = await Authenticator.validateSignature(
    endpoint,
    authChain,
    null as any,
    Date.now()
  )

  if (!result.ok) {
    throw new Error(result.message)
  }
}

export const withAuthentication = getAuthenticationMiddleware()
export const withPermissiveAuthentication = getAuthenticationMiddleware<PermissiveAuthRequest>(
  true
)
