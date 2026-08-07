import { Request } from 'express'
import { Authenticator, AuthIdentity, IdentityType } from '@dcl/crypto'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { AUTH_CHAIN_HEADER_PREFIX, decodeAuthChain } from './authentication'

// Header names are spelled out rather than imported from the middleware package so this spec is
// identical before and after the migration, which is what makes the before/after comparison valid.
const AUTH_TIMESTAMP_HEADER = 'x-identity-timestamp'
const AUTH_METADATA_HEADER = 'x-identity-metadata'
const SCENE_SIGNER = 'decentraland-kernel-scene'
const PATH = '/test'

type Identity = { authChain: AuthIdentity; ephemeralIdentity: IdentityType }

async function createTestIdentity(): Promise<Identity> {
  const ephemeralIdentity = createUnsafeIdentity()
  const realAccount = createUnsafeIdentity()
  const authChain = await Authenticator.initializeAuthChain(
    realAccount.address,
    ephemeralIdentity,
    10,
    async (message) => Authenticator.createSignature(realAccount, message)
  )

  return { authChain, ephemeralIdentity }
}

/** Signs `payload` with a real ephemeral chain and delivers `metadata` byte-for-byte as given. */
function requestSignedOver(
  payload: string,
  metadata: Record<string, unknown>,
  identity: Identity,
  timestamp: number
): Request {
  const chain = Authenticator.signPayload(
    {
      ephemeralIdentity: identity.ephemeralIdentity,
      expiration: new Date(),
      authChain: identity.authChain.authChain,
    },
    payload
  )

  const headers: Record<string, string> = {}
  chain.forEach((link, index) => {
    headers[`${AUTH_CHAIN_HEADER_PREFIX}${index}`] = JSON.stringify(link)
  })
  headers[AUTH_TIMESTAMP_HEADER] = String(timestamp)
  headers[AUTH_METADATA_HEADER] = JSON.stringify(metadata)

  return ({ headers, method: 'GET', path: PATH } as unknown) as Request
}

/**
 * Signs the canonical ADR-44 payload, which is lowercased before signing, so a mixed-case `signer`
 * travels with a genuinely valid signature — the signature only ever bound the lowercased form. This
 * is the attack itself, not a mock: `verify` runs for real and the signature really does check out.
 */
function signedRequest(
  metadata: Record<string, unknown>,
  identity: Identity
): Request {
  const timestamp = Date.now()
  // authentication.ts verifies against `/${API_VERSION}${req.path}`, so the signed path carries the
  // same prefix the middleware will rebuild.
  const payload = [
    'GET',
    `/v1${PATH}`,
    String(timestamp),
    JSON.stringify(metadata),
  ]
    .join(':')
    .toLowerCase()

  return requestSignedOver(payload, metadata, identity, timestamp)
}

/** Signs the pre-ADR-44 `method:path` payload, without a timestamp or metadata. */
function legacySignedRequest(
  metadata: Record<string, unknown>,
  identity: Identity
): Request {
  const payload = `GET:${PATH}`.toLowerCase()

  return requestSignedOver(payload, metadata, identity, Date.now())
}

describe('when decoding an authentication chain with a real signature', () => {
  let identity: Identity

  beforeEach(async () => {
    identity = await createTestIdentity()
  })

  describe('and a mixed-case scene signer is delivered', () => {
    it('should reject the request instead of accepting it as a directly user-signed one', async () => {
      const request = signedRequest(
        { signer: 'Decentraland-Kernel-Scene' },
        identity
      )

      await expect(decodeAuthChain(request)).rejects.toThrow(
        'Invalid signature'
      )
    })
  })

  describe('and a pre-ADR-44 signature arrives', () => {
    it('should authenticate through the temporary legacy fallback', async () => {
      const request = legacySignedRequest({}, identity)

      await expect(decodeAuthChain(request)).resolves.toBe(
        Authenticator.ownerAddress(identity.authChain.authChain).toLowerCase()
      )
    })
  })

  describe('and the canonical scene signer is delivered exactly as signed', () => {
    it('should keep rejecting it as a scene-originated request', async () => {
      const request = signedRequest({ signer: SCENE_SIGNER }, identity)

      await expect(decodeAuthChain(request)).rejects.toThrow(
        'Invalid signature'
      )
    })
  })

  describe('and the request carries no signer', () => {
    it('should resolve to the verified owner address', async () => {
      const request = signedRequest({}, identity)

      await expect(decodeAuthChain(request)).resolves.toBe(
        Authenticator.ownerAddress(identity.authChain.authChain).toLowerCase()
      )
    })
  })

  describe('and a padded scene signer is delivered', () => {
    it('should reject it as non-canonical metadata', async () => {
      const request = signedRequest({ signer: ` ${SCENE_SIGNER}` }, identity)

      await expect(decodeAuthChain(request)).rejects.toThrow(
        'Invalid signature'
      )
    })
  })
})
