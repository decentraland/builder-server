import { Authenticator, AuthIdentity } from 'dcl-crypto'
import { Model, QueryPart } from 'decentraland-server'
import { env } from 'decentraland-commons'
import { isManager } from '../src/ethereum/api/tpw'
import { AUTH_CHAIN_HEADER_PREFIX } from '../src/middleware/authentication'
import { Collection } from '../src/Collection/Collection.model'
import { collectionAttributesMock } from './mocks/collections'
import { wallet } from './mocks/wallet'

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
  if (!(Table.count as jest.Mock).mock) {
    throw new Error('Table.count is not mocked')
  }
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
  if (!(Table.count as jest.Mock).mock) {
    throw new Error('Table.count is not mocked')
  }

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

// TODO add JSDOC
export function mockCollectionAuthorizationMiddleware(
  id: string,
  eth_address: string,
  isThirdParty = false,
  isAuthorized = true
) {
  const collectionToReturn = {
    ...collectionAttributesMock,
    urn_suffix: isThirdParty ? 'third-party' : null,
    eth_address,
  }
  if (!(Collection.findOne as jest.Mock).mock) {
    throw new Error('Collection.findOne is not mocked')
  }

  if (isThirdParty && !(isManager as jest.Mock).mock) {
    throw new Error('isManager is not mocked')
  }

  ;(Collection.findOne as jest.Mock).mockImplementationOnce((givenId) =>
    givenId === id && isAuthorized ? collectionToReturn : undefined
  )
  if (isThirdParty) {
    ;(isManager as jest.MockedFunction<typeof isManager>).mockResolvedValueOnce(
      isAuthorized
    )
  }
}

// TODO add JSDOC
export function mockItemAuthorizationMiddleware(
  id: string,
  eth_address: string,
  isThirdParty = false,
  isAuthorized = true
) {
  const collectionToReturn = {
    ...collectionAttributesMock,
    urn_suffix: isThirdParty ? 'third-party' : null,
    eth_address,
  }

  if (!(Collection.findByOwnerOfItem as jest.Mock).mock) {
    throw new Error('Collection.findByOwnerOfItem is not mocked')
  }

  if (isThirdParty && !(isManager as jest.Mock).mock) {
    throw new Error('isManager is not mocked')
  }

  ;(Collection.findByOwnerOfItem as jest.Mock).mockImplementationOnce(
    (givenId) =>
      givenId === id && isAuthorized ? collectionToReturn : undefined
  )

  if (isThirdParty) {
    ;(isManager as jest.MockedFunction<typeof isManager>).mockResolvedValueOnce(
      isAuthorized
    )
  }
}

// TODO add JSDOC
export function mockOwnableCanUpsert(
  Model: typeof GenericModel,
  id: string,
  ethAddress: string,
  expectedUpsert: boolean
) {
  const canUpsert = (conditions: Record<string, unknown>): boolean =>
    expectedUpsert &&
    conditions.id === id &&
    conditions.eth_address === ethAddress

  if (!(Model.count as jest.Mock).mock) {
    throw new Error('Model.count is not mocked')
  }

  ;(Model.count as jest.Mock)
    .mockImplementationOnce((conditions: QueryPart) =>
      Promise.resolve(canUpsert(conditions) ? 0 : 1)
    )
    .mockImplementationOnce((conditions: QueryPart) =>
      Promise.resolve(canUpsert(conditions) ? 1 : 0)
    )
}
