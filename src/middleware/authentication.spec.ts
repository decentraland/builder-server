import { Request } from 'express'
import { Authenticator } from '@dcl/crypto'
import { verify } from '@dcl/crypto-middleware'
import { decodeAuthChain, SCENE_SIGNER } from './authentication'

jest.mock('@dcl/crypto-middleware')
jest.mock('@dcl/crypto')

describe('decodeAuthChain', () => {
  let mockRequest: Request

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

  it('returns the verified address', async () => {
    const verifyMock = verify as jest.Mock
    verifyMock.mockResolvedValue({
      auth: '0x12345',
      authMetadata: {},
    })

    await expect(decodeAuthChain(mockRequest)).resolves.toBe('0x12345')
  })

  it('rejects scene-signed requests after verification', async () => {
    const verifyMock = verify as jest.Mock
    verifyMock.mockResolvedValue({
      auth: '0x12345',
      authMetadata: { signer: SCENE_SIGNER },
    })

    await expect(decodeAuthChain(mockRequest)).rejects.toThrow(
      'Invalid signature'
    )
  })

  it('accepts a legacy signature when verify rejects it', async () => {
    const verifyMock = verify as jest.Mock
    const validateSignatureMock = Authenticator.validateSignature as jest.Mock
    verifyMock.mockRejectedValue(new Error('Expired signature'))
    validateSignatureMock.mockResolvedValue({
      ok: true,
    })

    await expect(decodeAuthChain(mockRequest)).resolves.toBe('0x12345')
  })

  it('reports both failures when neither signature scheme validates', async () => {
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
