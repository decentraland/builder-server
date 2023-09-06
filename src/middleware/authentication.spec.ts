import { Request } from 'express'
import { Authenticator } from '@dcl/crypto'
import { verify } from '@dcl/platform-crypto-middleware'
import {
  INVALID_AUTH_CHAIN_MESSAGE,
  MISSING_ETH_ADDRESS_ERROR,
  decodeAuthChain,
} from './authentication'

jest.mock('@dcl/crypto')
jest.mock('@dcl/platform-crypto-middleware')

describe('decodeAuthChain', () => {
  let mockRequest: Request

  beforeEach(() => {
    mockRequest = {
      headers: {},
      method: 'GET',
      path: '/',
    } as Request
  })

  describe('when the auth chain is invalid', () => {
    it('should throw an error for an invalid auth chain', async () => {
      mockRequest.headers = {
        'x-identity-auth-chain-0': '{"invalidPart": "data"}',
      }

      await expect(decodeAuthChain(mockRequest)).rejects.toThrow(
        INVALID_AUTH_CHAIN_MESSAGE
      )
    })
  })

  describe('when the auth chain is valid', () => {
    beforeEach(() => {
      ;(Authenticator.isValidAuthChain as jest.Mock).mockReturnValue(true)
    })

    afterEach(() => {
      ;(Authenticator.isValidAuthChain as jest.Mock).mockRestore()
    })

    describe('and it is missing an ETH address', () => {
      it('should throw an error with the missing ETH address message', async () => {
        await expect(decodeAuthChain(mockRequest)).rejects.toThrow(
          MISSING_ETH_ADDRESS_ERROR
        )
      })
    })

    describe('and it has the ETH address defined', () => {
      let validAddress = '0x12345'
      beforeEach(() => {
        ;(Authenticator.ownerAddress as jest.Mock).mockReturnValue(validAddress)
      })

      afterEach(() => {
        ;(Authenticator.isValidAuthChain as jest.Mock).mockRestore()
      })

      describe('and the verify method does not throw an error', () => {
        beforeEach(() => {
          ;(verify as jest.Mock).mockReturnValue(validAddress)
        })

        afterEach(() => {
          ;(verify as jest.Mock).mockRestore()
        })

        it('should return the eth address without throwing an error', async () => {
          const result = await decodeAuthChain(mockRequest)
          expect(result).toBe(validAddress)
          await expect(decodeAuthChain(mockRequest)).resolves.not.toThrow()
        })
      })

      describe('and the verify method throws an error', () => {
        beforeEach(() => {
          ;(verify as jest.Mock).mockRejectedValue('Error')
        })

        afterEach(() => {
          ;(verify as jest.Mock).mockRestore()
        })

        describe('and the validateSignature function does not throw an error', () => {
          beforeEach(() => {
            ;(Authenticator.validateSignature as jest.Mock).mockReturnValue({
              ok: true,
            })
          })

          afterEach(() => {
            ;(Authenticator.validateSignature as jest.Mock).mockRestore()
          })
          it('should return the eth address without throwing an error', async () => {
            const result = await decodeAuthChain(mockRequest)
            expect(result).toBe(validAddress)
            await expect(decodeAuthChain(mockRequest)).resolves.not.toThrow()
          })
        })

        describe('and the validateSignature method throws an error', () => {
          let error: string
          beforeEach(() => {
            error = 'validateSignature failed'
            ;(Authenticator.validateSignature as jest.Mock).mockReturnValue({
              ok: false,
              message: error,
            })
          })

          afterEach(() => {
            ;(Authenticator.validateSignature as jest.Mock).mockRestore()
          })
          it('should throw the error', async () => {
            await expect(decodeAuthChain(mockRequest)).rejects.toThrow(error)
          })
        })
      })
    })
  })
})
