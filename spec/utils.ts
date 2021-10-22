import { Authenticator, AuthIdentity, AuthLinkType } from 'dcl-crypto'
import { Model, QueryPart } from 'decentraland-server'
import { env } from 'decentraland-commons'
import { AUTH_CHAIN_HEADER_PREFIX } from '../src/middleware/authentication'

export type Wallet = {
  address: string
  identity: AuthIdentity
}

// Mock wallet with a valid identity that lasts until 2026. Useful for making authorized requests to the server
export const wallet: Wallet = {
  address: '0xc6d2000a7a1ddca92941f4e2b41360fe4ee2abd9',
  identity: {
    ephemeralIdentity: {
      address: '0x00d1244305653Be915D066d39d4c6b54808e59a9',
      publicKey:
        '0x043e17ed6a1e1ea903660fb0be36f841c808aff2a595f9b3e3a3caaf970dbb197bd91e414a945ebd27beb478ab85c361127d2e807d014626035881348ccaf69281',
      privateKey:
        '0x91ee230307805931ac133b16a3eae41eeb404c8e16436ade9ea07d736217f8fb',
    },
    expiration: new Date('2026-11-01T19:27:26.452Z'),
    authChain: [
      {
        type: AuthLinkType.SIGNER,
        payload: '0xc6d2000a7a1ddca92941f4e2b41360fe4ee2abd9',
        signature: '',
      },
      {
        type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
        payload:
          'Decentraland Login\nEphemeral address: 0x00d1244305653Be915D066d39d4c6b54808e59a9\nExpiration: 2026-11-01T19:27:26.452Z',
        signature:
          '0x22fa60a6f0c5b979524b6ceea6318ca4491ddd831efa7d60369546f2b66f38383014d262c5ce4e4b859298fe1bc992d990909389d7f6cb5c765d17f9ae2118101b',
      },
    ],
  },
}

export function buildURL(
  uri: string,
  queryString: Record<string, string> = {}
) {
  const API_VERSION = env.get('API_VERSION', 'v1')
  return `/${API_VERSION}${uri}${buildSearch(queryString)}`
}

export function buildSearch(queryString: Record<string, string>) {
  if (Object.keys(queryString).length === 0) {
    return ''
  }
  const params = new URLSearchParams(queryString)
  return `?${params.toString()}`
}

export function createAuthHeaders(
  method: string = 'get',
  path: string = '',
  identity: AuthIdentity = wallet.identity
) {
  const headers: Record<string, string> = {}
  const endpoint = (method + ':' + path).toLowerCase()
  const authChain = Authenticator.signPayload(identity, endpoint)
  for (let i = 0; i < authChain.length; i++) {
    headers[AUTH_CHAIN_HEADER_PREFIX + i] = JSON.stringify(authChain[i])
  }
  return headers
}

export class GenericModel extends Model<any> {}

// Takes in a mocked (jest.mock()) Model class
// These methods are sadly order bound, meaning that you'll have to check the router and mock the middlewares in the same order they appear there
export function mockExistsMiddleware(Table: typeof GenericModel, id: string) {
  ;(Table.count as jest.Mock).mockImplementationOnce(
    (conditions: QueryPart) => {
      return conditions['id'] === id && Object.keys(conditions).length === 1
        ? 1
        : 0
    }
  )
}

// Takes in a mocked (jest.mock()) Model class
// These methods are sadly order bound, meaning that you'll have to check the router and mock the middlewares in the same order they appear there
export function mockAuthorizationMiddleware(
  Table: typeof GenericModel,
  id: string,
  eth_address: string
) {
  ;(Table.count as jest.Mock).mockImplementationOnce(
    (conditions: QueryPart) => {
      return conditions['id'] === id &&
        conditions['eth_address'] === eth_address &&
        Object.keys(conditions).length === 2
        ? 1
        : 0
    }
  )
}
