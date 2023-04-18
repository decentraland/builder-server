import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client/core'
import 'isomorphic-fetch'
import { env } from 'decentraland-commons'

export function createClient(url: string) {
  const link = new HttpLink({
    uri: url,
    fetch: fetchWithTimeout,
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

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  const response = await fetch(uri, {
    ...options,
    signal: controller.signal,
  })

  clearTimeout(id)
  return response
}
