import { Request } from 'express'
import { Authenticator } from '@dcl/crypto'
import { verify } from '@dcl/crypto-middleware'
import {
  AUTH_METADATA_HEADER,
  decodeAuthChain,
  SCENE_SIGNER,
} from './authentication'

// Only `verify` is mocked. A bare jest.mock auto-mocks every export, which would leave
// `rejectIfSigner` returning undefined — the predicate built at import time would then be undefined
// and the scene check would throw instead of running.
jest.mock('@dcl/crypto-middleware', () => ({
  ...jest.requireActual('@dcl/crypto-middleware'),
  verify: jest.fn(),
}))
jest.mock('@dcl/crypto')

describe('when decoding an authentication chain', () => {
  let mockRequest: Request

  describe('and the authentication chain is valid', () => {
    beforeEach(() => {
      mockRequest = {
        headers: {},
        method: 'GET',
        path: '/',
      } as Request
      const isValidAuthChain = Authenticator.isValidAuthChain as jest.Mock
      const ownerAddress = Authenticator.ownerAddress as jest.Mock
      isValidAuthChain.mockReturnValue(true)
      ownerAddress.mockReturnValue('0x12345')
    })

    describe('and the request delivers no signer', () => {
      beforeEach(() => {
        const verifyMock = verify as jest.Mock
        verifyMock.mockResolvedValue({
          auth: '0x12345',
          authMetadata: {},
        })
      })

      it('should return the verified address', async () => {
        await expect(decodeAuthChain(mockRequest)).resolves.toBe('0x12345')
      })
    })

    // The gate reads the metadata the request delivers, not `verify()`'s return, because the legacy
    // fallback below binds no metadata: a refusal raised after `verify()` would be caught by that
    // fallback and cleared. So these deliver the header and let `verify()` succeed, which is the
    // arrangement that would wave a scene signer through if the gate sat on the wrong side.
    describe.each([
      ['the canonical scene signer', SCENE_SIGNER],
      ['a re-cased scene signer', 'Decentraland-Kernel-Scene'],
      ['an upper-cased scene signer', 'DECENTRALAND-KERNEL-SCENE'],
      ['a whitespace-padded scene signer', ' decentraland-kernel-scene'],
      ['a non-canonical signer of any kind', 'Dcl:Explorer'],
    ])('and the request delivers %s', (_case, signer) => {
      beforeEach(() => {
        mockRequest.headers[AUTH_METADATA_HEADER] = JSON.stringify({ signer })
        const verifyMock = verify as jest.Mock
        verifyMock.mockResolvedValue({
          auth: '0x12345',
          authMetadata: { signer },
        })
      })

      it('should reject the request', async () => {
        await expect(decodeAuthChain(mockRequest)).rejects.toThrow(
          'Invalid signature'
        )
      })
    })

    describe('and ADR-44 verification fails but the legacy signature is valid', () => {
      it('should return the legacy verified address', async () => {
        const verifyMock = verify as jest.Mock
        const validateSignatureMock = Authenticator.validateSignature as jest.Mock
        verifyMock.mockRejectedValue(new Error('Expired signature'))
        validateSignatureMock.mockResolvedValue({
          ok: true,
        })

        await expect(decodeAuthChain(mockRequest)).resolves.toBe('0x12345')
      })
    })

    describe('and ADR-44 and legacy verification both fail', () => {
      it('should report the ADR-44 failure', async () => {
        const verifyMock = verify as jest.Mock
        const validateSignatureMock = Authenticator.validateSignature as jest.Mock
        verifyMock.mockRejectedValue(new Error('Expired signature'))
        validateSignatureMock.mockResolvedValue({
          ok: false,
          message: 'Invalid legacy signature',
        })

        await expect(decodeAuthChain(mockRequest)).rejects.toThrow(
          'Expired signature'
        )
      })
    })
  })
})
