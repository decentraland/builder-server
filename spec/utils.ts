import { Authenticator, AuthIdentity } from 'dcl-crypto'
import { Model, QueryPart } from 'decentraland-server'
import { env } from 'decentraland-commons'
import { isManager } from '../src/ethereum/api/tpw'
import { collectionAPI } from '../src/ethereum/api/collection'
import { isPublished } from '../src/utils/eth'
import { AUTH_CHAIN_HEADER_PREFIX } from '../src/middleware/authentication'
import { Collection } from '../src/Collection/Collection.model'
import { collectionAttributesMock } from './mocks/collections'
import { wallet } from './mocks/wallet'
import { Ownable } from '../src/Ownable/Ownable'
import { Item } from '../src/Item/Item.model'
import { dbItemMock } from './mocks/items'

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

  if ((Ownable.prototype.isOwnedBy as jest.Mock).mock) {
    throw new Error('Ownable.isOwnedBy is mocked')
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

/**
 * Mocks the "withModelAuthorization" middleware used in the collection's middleware
 * by mocking all the function calls to the Collection model and the TPW requests.
 * This mock requires the Collection model and the TPW "isManager" method to be mocked first.
 *
 * @param id - The id of the collection to be authorized.
 * @param ethAddress - The ethAddress of the user that will be requesting authorization to the collection.
 * @param isThirdParty - If the mock is for a third party collection.
 * @param isAuthorized - If the user should be authorized or not. This is useful to test the response of the middleware.
 */
export function mockCollectionAuthorizationMiddleware(
  id: string,
  ethAddress: string,
  isThirdParty = false,
  isAuthorized = true
) {
  const collectionToReturn = {
    ...collectionAttributesMock,
    urn_suffix: isThirdParty ? 'third-party' : null,
    eth_address: ethAddress,
  }
  if (!(Collection.findOne as jest.Mock).mock) {
    throw new Error('Collection.findOne is not mocked')
  }

  ;(Collection.findOne as jest.Mock).mockImplementationOnce((givenId) =>
    Promise.resolve(
      givenId === id && isAuthorized ? collectionToReturn : undefined
    )
  )
  if (isThirdParty) {
    if (!(isManager as jest.Mock).mock) {
      throw new Error('isManager is not mocked')
    }

    ;(isManager as jest.MockedFunction<typeof isManager>).mockResolvedValueOnce(
      isAuthorized
    )
  }
}

/**
 * Mocks the "withModelAuthorization" middleware used in the items's middleware
 * by mocking all the function calls to the Collection model and the TPW requests.
 * This mock requires the Collection model and the TPW "isManager" method to be mocked first.
 *
 * @param id - The id of the item to be authorized.
 * @param ethAddress - The ethAddress of the user that will be requesting authorization to the item.
 * @param isThirdParty - If the mock is for a third party item.
 * @param isAuthorized - If the user should be authorized or not. This is useful to test the response of the middleware.
 */
export function mockItemAuthorizationMiddleware(
  id: string,
  eth_address: string,
  isThirdParty = false,
  isAuthorized = true
) {
  const itemToReturn = {
    ...dbItemMock,
    urn_suffix: isThirdParty ? 'third-party' : null,
    eth_address,
  }

  ;(Item.findOne as jest.Mock).mockImplementationOnce((givenId) =>
    Promise.resolve(givenId === id && isAuthorized ? itemToReturn : undefined)
  )

  if (isThirdParty) {
    mockCollectionAuthorizationMiddleware(
      dbItemMock.collection_id!,
      eth_address,
      isThirdParty,
      isAuthorized
    )
  }
}

/**
 * Mocks the "Ownable.canUpsert" method by mocking the all the function calls to the Collection model.
 * This mock requires the Collection model to be mocked first.
 * Mocking the Ownable.canUpsert method will make this mock throw.
 *
 * @param Model - The model to be authorized.
 * @param id - The id of the model to be authorized
 * @param ethAddress - The ethAddress of the user that will be requesting authorization to the model.
 * @param expectedUpsert - If the user should be able to upsert the model or not.
 */
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

  if ((Ownable.prototype.canUpsert as jest.Mock).mock) {
    throw new Error('Ownable.canUpsert is mocked')
  }

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

export function mockIsCollectionPublished(
  id: string,
  isCollectionPublished: boolean
) {
  ;(collectionAPI.fetchCollection as jest.Mock).mockImplementationOnce(
    (givenId) =>
      Promise.resolve(id === givenId && isCollectionPublished ? {} : undefined)
  )
  if (isCollectionPublished) {
    ;(isPublished as jest.Mock).mockResolvedValueOnce(isCollectionPublished)
  }
}
