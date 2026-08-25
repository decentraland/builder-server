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

  // The legacy fallback validates only `method:path`, which binds no metadata at all. These pin that
  // a request the signer gate refuses cannot be waved through by holding a valid legacy signature —
  // before the gate moved ahead of the fallback, the non-canonical case below resolved to an address.
  describe('and a valid pre-ADR-44 signature arrives with metadata the signer gate refuses', () => {
    let request: Request

    describe('and the metadata names the scene signer', () => {
      beforeEach(() => {
        request = legacySignedRequest({ signer: SCENE_SIGNER }, identity)
      })

      it('should reject it instead of letting the legacy signature clear the refusal', async () => {
        await expect(decodeAuthChain(request)).rejects.toThrow(
          'Invalid signature'
        )
      })
    })

    describe('and the metadata names a non-canonical signer', () => {
      beforeEach(() => {
        request = legacySignedRequest({ signer: 'Dcl:Explorer' }, identity)
      })

      it('should reject it instead of letting the legacy signature clear the refusal', async () => {
        await expect(decodeAuthChain(request)).rejects.toThrow(
          'Invalid signature'
        )
      })
    })

    describe('and the metadata names a canonical signer the gate allows', () => {
      beforeEach(() => {
        request = legacySignedRequest({ signer: 'dcl:builder' }, identity)
      })

      it('should still authenticate, so the gate does not break legacy callers', async () => {
        await expect(decodeAuthChain(request)).resolves.toBe(
          Authenticator.ownerAddress(identity.authChain.authChain).toLowerCase()
        )
      })
    })
  })

  // A legacy-signed request carries a signature over `method:path` alone, so the fallback cannot
  // refuse anything about the metadata. If the gate lets a malformed header through, the request is
  // served with v6 metadata verification skipped entirely and the bad header simply ignored.
  describe('and a valid pre-ADR-44 signature arrives with metadata that cannot be read', () => {
    let request: Request

    describe('and the metadata header is not valid JSON', () => {
      beforeEach(() => {
        request = legacySignedRequest({}, identity)
        request.headers[AUTH_METADATA_HEADER] = '{not json'
      })

      it('should reject it rather than ignore the header and serve the request', async () => {
        await expect(decodeAuthChain(request)).rejects.toThrow('Invalid signature')
      })
    })

    describe('and the metadata header is a JSON primitive', () => {
      beforeEach(() => {
        request = legacySignedRequest({}, identity)
        request.headers[AUTH_METADATA_HEADER] = '"just-a-string"'
      })

      it('should reject it, since a primitive cannot carry the fields handlers read', async () => {
        await expect(decodeAuthChain(request)).rejects.toThrow('Invalid signature')
      })
    })

    describe.each([['[]'], ['[{"signer":"decentraland-kernel-scene"}]']])(
      'and the metadata header is the JSON array %s',
      (arrayMetadata) => {
        beforeEach(() => {
          request = legacySignedRequest({}, identity)
          request.headers[AUTH_METADATA_HEADER] = arrayMetadata
        })

        // The shape that reads as an object and is not null, so it reaches the signer gate, which
        // finds no `signer` on it and allows it. `verifyMetadata()` refuses arrays outright, and
        // without this that refusal is what the legacy signature would clear.
        it('should reject it rather than let it read as metadata carrying no signer', async () => {
          await expect(decodeAuthChain(request)).rejects.toThrow('Invalid signature')
        })
      }
    )

    describe('and the metadata header is explicit JSON null', () => {
      beforeEach(() => {
        request = legacySignedRequest({}, identity)
        request.headers[AUTH_METADATA_HEADER] = 'null'
      })

      // Not a refusal, deliberately: `verifyMetadata()` maps null to `{}` for callers migrating
      // from @dcl/platform-crypto-middleware, so `verify()` would have served this. The gate exists
      // to preserve that check's refusals, not to add its own.
      it('should authenticate, since verify() would have read it as empty metadata', async () => {
        await expect(decodeAuthChain(request)).resolves.toBe(
          Authenticator.ownerAddress(identity.authChain.authChain).toLowerCase()
        )
      })
    })

    describe('and the metadata header is delivered twice', () => {
      beforeEach(() => {
        request = legacySignedRequest({}, identity)
        // Duplicate headers arrive as an array; there is no telling which one a handler would read.
        ;(request.headers as Record<string, unknown>)[AUTH_METADATA_HEADER] = ['{}', '{"signer":"x"}']
      })

      it('should reject it rather than pick one of them', async () => {
        await expect(decodeAuthChain(request)).rejects.toThrow('Invalid signature')
      })
    })

    describe('and no metadata header is sent at all', () => {
      beforeEach(() => {
        request = legacySignedRequest({}, identity)
        delete request.headers[AUTH_METADATA_HEADER]
      })

      // Absent is the shape the fallback exists for, so it must stay served.
      it('should still authenticate through the legacy fallback', async () => {
        await expect(decodeAuthChain(request)).resolves.toBe(
          Authenticator.ownerAddress(identity.authChain.authChain).toLowerCase()
        )
      })
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
