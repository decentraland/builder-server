import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client/core'
import 'isomorphic-fetch'

export function createClient(url: string) {
  const link = new HttpLink({
    uri: url,
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
