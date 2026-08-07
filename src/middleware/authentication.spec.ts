import { Request } from 'express'
import { Authenticator } from '@dcl/crypto'
import { verify } from '@dcl/crypto-middleware'
import { decodeAuthChain, SCENE_SIGNER } from './authentication'

jest.mock('@dcl/crypto-middleware')
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
