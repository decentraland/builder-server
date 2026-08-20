import { Request } from 'express'
import { Authenticator } from '@dcl/crypto'
import { verify } from '@dcl/crypto-middleware'
import { decodeAuthChain, SCENE_SIGNER } from './authentication'

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

    describe('and ADR-44 verification succeeds without a scene signer', () => {
      it('should return the verified address', async () => {
        const verifyMock = verify as jest.Mock
        verifyMock.mockResolvedValue({
          auth: '0x12345',
          authMetadata: {},
        })

        await expect(decodeAuthChain(mockRequest)).resolves.toBe('0x12345')
      })
    })

    describe('and ADR-44 verification identifies a scene signer', () => {
      it('should reject the request', async () => {
        const verifyMock = verify as jest.Mock
        verifyMock.mockResolvedValue({
          auth: '0x12345',
          authMetadata: { signer: SCENE_SIGNER },
        })

        await expect(decodeAuthChain(mockRequest)).rejects.toThrow(
          'Invalid signature'
        )
      })
    })

    // A client that signs a non-canonical scene signer itself produces a valid signature, so no
    // byte binding can refuse it and only the gate can. The previous exact comparison could not:
    // `'Decentraland-Kernel-Scene' === SCENE_SIGNER` is false, so a scene request was accepted as
    // directly user-signed. `rejectIfSigner` refuses a signer that is not already canonical.
    describe.each([
      ['re-cased', 'Decentraland-Kernel-Scene'],
      ['upper-cased', 'DECENTRALAND-KERNEL-SCENE'],
      ['whitespace-padded', ' decentraland-kernel-scene'],
    ])('and ADR-44 verification returns a %s scene signer', (_case, signer) => {
      it('should reject the request', async () => {
        const verifyMock = verify as jest.Mock
        verifyMock.mockResolvedValue({
          auth: '0x12345',
          authMetadata: { signer },
        })

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
