import { db } from 'decentraland-server'
import { env } from 'decentraland-commons'

const pg = db.clients.postgres

export const analytics: typeof pg = Object.create(pg)

analytics.connect = async () => {
  const ANALYTICS_CONNECTION_STRING = env.get(
    'ANALYTICS_CONNECTION_STRING',
    undefined
  )
  return pg.connect.apply(analytics, [ANALYTICS_CONNECTION_STRING])
}
