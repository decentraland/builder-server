import { db } from 'decentraland-server'
import { env } from 'decentraland-commons'

const pg = db.clients.postgres

export const database: typeof pg = Object.create(pg)

database.connect = async () => {
  const CONNECTION_STRING = env.get('CONNECTION_STRING', undefined)
  await pg.connect(CONNECTION_STRING)
}
