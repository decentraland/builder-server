import {
  ApolloQueryResult,
  NetworkStatus,
  OperationVariables,
  QueryOptions,
} from '@apollo/client/core'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client/core'
import { createClient } from './graphClient'

export const MAX_RESULTS = 1000

export const PAGINATION_VARIABLES = `
  $first: Int = ${MAX_RESULTS}
  $skip: Int = 0
`

export const PAGINATION_ARGUMENTS = `
  first: $first
  skip: $skip
`

export class BaseGraphAPI {
  private client: ApolloClient<NormalizedCacheObject>

  constructor(public url: string) {
    this.client = createClient(url)
  }

  protected async paginate<
    T,
    K extends string,
    TVariables = OperationVariables
  >(keys: K[], options: QueryOptions<TVariables, T>): Promise<T[]> {
    const queryOptions = {
      ...options,
      variables: { ...options.variables, skip: 0 },
    }
    let pagination: T[] = []
    let partialResult: T[] | undefined

    while (!partialResult || partialResult.length === MAX_RESULTS) {
      const queryResult = await this.query<Record<K, T[]>, TVariables>(
        queryOptions as any // forcing typescript to accept the skip variable
      )
      partialResult = []
      for (const key of keys) {
        if (queryResult.data[key]) {
          partialResult = partialResult.concat(queryResult.data[key])
        }
      }
      pagination = pagination.concat(partialResult)
      queryOptions.variables.skip += MAX_RESULTS
    }

    return pagination
  }

  protected async query<T = any, TVariables = OperationVariables>(
    options: QueryOptions<TVariables, T>
  ): Promise<ApolloQueryResult<T>> {
    try {
      const result = await this.client.query<T, TVariables>(options)
      return result
    } catch (error) {
      const data = {} as T
      return { data, loading: false, networkStatus: NetworkStatus.error }
    }
  }
}
