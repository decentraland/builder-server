import { Request, Response, NextFunction } from 'express'
import { env } from 'decentraland-commons'
import { AuthLink, Authenticator } from '@dcl/crypto'
import {
  AUTH_CHAIN_HEADER_PREFIX,
  rejectIfSigner,
  verify,
} from '@dcl/crypto-middleware'
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

/**
 * Refuses a scene signer on the metadata a request delivers.
 *
 * Also refuses a `signer` that is not already canonical, which an exact match could not: a client
 * that signs `Decentraland-Kernel-Scene` itself produces a valid signature, so no byte binding can
 * catch it and only a gate can. Nothing is folded — the value reaching handlers is what was signed.
 */
const isNotSceneSigner = rejectIfSigner(SCENE_SIGNER)

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
 * Refuses the delivered metadata header, before any signature is checked.
 *
 * This runs on the raw header rather than on `verify()`'s parsed result because of what sits below:
 * the legacy `method:path` fallback binds no metadata at all. A refusal raised inside the `verify()`
 * attempt would be caught by that fallback and cleared by a legacy signature that never covered the
 * metadata, so the gate has to refuse before the fallback is reachable.
 *
 * Delegates the signer decision to `isNotSceneSigner` rather than comparing by hand, so one
 * predicate decides. That is strictly stricter than the normalizing comparison it replaces: it
 * refuses the scene signer, any non-canonical spelling of any signer, and a re-cased or duplicated
 * `signer` key. Nothing is folded — a value that is not already canonical is refused, never
 * rewritten.
 *
 * A metadata header that is present but unusable — unparseable, primitive, or duplicated across
 * headers — is refused here for the same reason, not merely left to `verify()`. `verify()` would
 * indeed reject it, but that rejection lands in the fallback below and is cleared by a legacy
 * signature that binds no metadata, so the malformed header would be ignored rather than refused.
 * An absent header is not refused: that is the pre-ADR-44 shape the fallback exists to serve.
 */
function declaresRefusedMetadata(req: Request): boolean {
  const raw = req.headers[AUTH_METADATA_HEADER]

  // Absent is the pre-ADR-44 shape: no metadata to bind, and the legacy fallback is what serves it.
  if (raw === undefined) {
    return false
  }

  // Present but not a single header value: duplicate `x-identity-metadata` headers arrive as an
  // array, and there is no way to tell which one a handler would have read.
  if (typeof raw !== 'string') {
    return true
  }

  let metadata: unknown
  try {
    metadata = JSON.parse(raw)
  } catch {
    // Present but unparseable. `verify()` would refuse this on its own terms -- but that refusal
    // lands in the catch below, which retries against the legacy `method:path` signature. That
    // signature binds no metadata at all, so the malformed header would simply be ignored and the
    // request served, having skipped v6 metadata verification entirely. Refuse it here instead,
    // where the fallback cannot reach.
    return true
  }

  // Present but not an object: a primitive or null cannot carry the fields handlers read, and would
  // reach the fallback the same way.
  if (typeof metadata !== 'object' || metadata === null) {
    return true
  }

  return !isNotSceneSigner(metadata as Record<string, unknown>)
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

  if (declaresRefusedMetadata(req)) {
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
