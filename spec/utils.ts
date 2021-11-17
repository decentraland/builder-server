import { Authenticator, AuthIdentity } from 'dcl-crypto'
import { Model, QueryPart } from 'decentraland-server'
import { env } from 'decentraland-commons'
import { collectionAPI } from '../src/ethereum/api/collection'
import { isPublished } from '../src/utils/eth'
import { AUTH_CHAIN_HEADER_PREFIX } from '../src/middleware/authentication'
import { Collection } from '../src/Collection/Collection.model'
import { Ownable } from '../src/Ownable/Ownable'
import { Item } from '../src/Item/Item.model'
import { thirdPartyAPI } from '../src/ethereum/api/thirdParty'
import { wallet } from './mocks/wallet'
import { collectionAttributesMock } from './mocks/collections'
import { dbItemMock } from './mocks/items'
import { ThirdPartyItemsFragment } from '../src/ethereum/api/fragments'

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

/**
 * Mocks the "Date.now()" call done in the authentication middleware for tests that
 * require mocking the "Date.now" call.
 */
export function mockAuthenticationSignatureValidationDate() {
  const currentDate = Date.now()
  jest.spyOn(Date, 'now').mockReturnValueOnce(currentDate)
}

export class GenericModel extends Model<any> {}

// Takes in a mocked (jest.mock()) Model class
// These methods are sadly order bound, meaning that you'll have to check the router and mock the middlewares in the same order they appear there
export function mockExistsMiddleware(Table: typeof GenericModel, id: string) {
  if (!(Table.count as jest.Mock).mock) {
    throw new Error(
      "Table.count should be mocked to mock the withModelExists middleware but it isn't"
    )
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
    throw new Error(
      "Table.count should be mocked to mock the withModelAuthorization middleware but it isn't"
    )
  }

  if ((Ownable.prototype.isOwnedBy as jest.Mock).mock) {
    throw new Error(
      'Ownable.isOwnedBy should not be mocked to correctly mock the withModelAuthorization middleware but it is'
    )
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
 * This mock requires the Collection model and the TPW API "isManager" method to be mocked first.
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
    urn_suffix: isThirdParty ? 'third-party-collection-id' : null,
    third_party_id: isThirdParty ? 'third-party-id' : null,
    eth_address: ethAddress,
  }
  if (!(Collection.findOne as jest.Mock).mock) {
    throw new Error(
      "Collection.findOne should be mocked to mock the withModelAuthorization middleware but isn't"
    )
  }

  ;(Collection.findOne as jest.Mock).mockImplementationOnce((givenId) =>
    Promise.resolve(
      givenId === id && (isAuthorized || isThirdParty)
        ? collectionToReturn
        : undefined
    )
  )
  if (isThirdParty) {
    if (!(thirdPartyAPI.isManager as jest.Mock).mock) {
      throw new Error(
        "isManager should be mocked to mock the withModelExists middleware but it isn't"
      )
    }

    ;(thirdPartyAPI.isManager as jest.MockedFunction<
      typeof thirdPartyAPI.isManager
    >).mockResolvedValueOnce(isAuthorized)
  }
}

/**
 * Mocks the "withModelAuthorization" middleware used in the items's middleware
 * by mocking all the function calls to the Collection model and the TPW requests.
 * This mock requires the Item model findOne method to be mocked first.
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
 * @param id - The id of the model to be authorized.
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
    throw new Error(
      'Ownable.canUpsert should not be mocked to correctly mock the Ownable.canUpsert method internally but it is'
    )
  }

  if (!(Model.count as jest.Mock).mock) {
    throw new Error(
      "Model.count should be mocked to mock the Ownable.canUpsert method but it isn't"
    )
  }

  ;(Model.count as jest.Mock)
    .mockImplementationOnce((conditions: QueryPart) =>
      Promise.resolve(canUpsert(conditions) ? 0 : 1)
    )
    .mockImplementationOnce((conditions: QueryPart) =>
      Promise.resolve(canUpsert(conditions) ? 1 : 0)
    )
}

/**
 * Mocks the "isPublished" method of the CollectionService by mocking the all the function calls.
 * This mock requires the collectionAPI.fetchCollection module and the isPublished methods to be mocked first.
 *
 * @param id - The id of the collection to be checked if published.
 * @param isCollectionPublished - If the collection is published or not.
 */
export function mockIsCollectionPublished(
  id: string,
  isCollectionPublished: boolean
) {
  if (!(collectionAPI.fetchCollection as jest.Mock).mock) {
    throw new Error(
      "collectionAPI.fetchCollection should be mocked to mock the CollectionService.isPublished method but it isn't"
    )
  }

  if (!(isPublished as jest.Mock).mock) {
    throw new Error(
      "isPublished should be mocked to mock the CollectionService.isPublished method but it isn't"
    )
  }

  ;(collectionAPI.fetchCollection as jest.Mock).mockImplementationOnce(
    (givenId) =>
      Promise.resolve(id === givenId && isCollectionPublished ? {} : undefined)
  )
  if (isCollectionPublished) {
    ;(isPublished as jest.Mock).mockResolvedValueOnce(isCollectionPublished)
  }
}

/**
 * Mocks the "fetchThirdPartyCollectionItems" method of the thirdPartyAPI module.
 * This mock requires the thirdPartyAPI.fetchThirdPartyCollectionItems method to be mocked first.
 *
 * @param thirdPartyId - The third party id to mock the response for.
 * @param collectionUrnSuffix - The collection urn suffix to mock the response for.
 * @param hasItems - If the third party collection has items or not.
 */
export function mockThirdPartyCollectionWithItems(
  thirdPartyId: string,
  collectionUrnSuffix: string,
  hasItems: boolean
): void {
  if (!(thirdPartyAPI.fetchThirdPartyCollectionItems as jest.Mock).mock) {
    throw new Error(
      "thirdPartyAPI.fetchThirdPartyCollectionItems should be mocked to mock the fetchThirdPartyCollectionItems method but it isn't"
    )
  }
  ;(thirdPartyAPI.fetchThirdPartyCollectionItems as jest.MockedFunction<
    typeof thirdPartyAPI.fetchThirdPartyCollectionItems
  >).mockImplementationOnce((tpId, collectionURN) => {
    if (tpId !== thirdPartyId || collectionURN !== collectionUrnSuffix) {
      return Promise.reject(
        new Error(
          `Mock was expected to be called with ${thirdPartyId} and ${collectionUrnSuffix} but was called with ${tpId} and ${collectionURN}`
        )
      )
    }
    return Promise.resolve(hasItems ? [{} as ThirdPartyItemsFragment] : [])
  })
}
