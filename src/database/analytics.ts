import { Pool, PoolClient } from 'pg'
import { env } from 'decentraland-commons'

const ANALYTICS_CONNECTION_STRING = env.get('ANALYTICS_CONNECTION_STRING', '')
console.assert(ANALYTICS_CONNECTION_STRING, 'No connection string')

export const analyticsPool = new Pool({
  connectionString: ANALYTICS_CONNECTION_STRING,
  query_timeout: 30000,
})

analyticsPool.on('error', (error) => console.error(error))

export async function getAnalyticsClient<T>(
  cb: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await analyticsPool.connect()

  try {
    return await cb(client)
  } catch (e) {
    console.error(e)
    throw e
  } finally {
    client.release()
  }
}
