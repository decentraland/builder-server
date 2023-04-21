import nodefetch, { RequestInit } from 'node-fetch'
import { env } from 'decentraland-commons'
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client/core'
import { createConsoleLogComponent } from '@well-known-components/logger'
import { isErrorWithMessage } from '../../utils/errors'

export function createClient(url: string) {
  const link = new HttpLink({
    uri: url,
    fetch: fetchWithTimeout as any,
  })

  const client = new ApolloClient({
    link,
    cache: new InMemoryCache({ addTypename: false }),
    defaultOptions: {
      query: {
        fetchPolicy: 'no-cache',
      },
    },
  })

  return client
}

async function fetchWithTimeout(uri: string, options: RequestInit) {
  const timeout = Number(env.get('GRAPH_QUERY_TIMEOUT', 10000))
  const logger = createConsoleLogComponent().getLogger('Fetch GraphAPI')

  try {
    const controller = new AbortController()

    const id = setTimeout(() => {
      controller.abort()
    }, timeout)

    const response = await nodefetch(uri, {
      ...options,
      signal: controller.signal as RequestInit['signal'],
    })

    clearTimeout(id)

    return response
  } catch (error) {
    if (isErrorWithMessage(error) && error.message.includes('aborted')) {
      const requestBody = JSON.parse(options.body as string)
      logger.error(
        `Timeout fetching the subgraph: ${uri}/${requestBody.operationName}`
      )
      throw new Error(error.message)
    }

    throw error
  }
}
