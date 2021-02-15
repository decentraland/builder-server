import { db } from 'decentraland-server'
import { env } from 'decentraland-commons'

const pg = db.clients.postgres

export const database: typeof pg = Object.create(pg)

pg.setTypeParser(1114, (date) => {
  const utcStr = `${date}Z`
  return new Date(utcStr).toISOString()
})

database.connect = async () => {
  const CONNECTION_STRING = env.get('CONNECTION_STRING', undefined)
  return pg.connect(CONNECTION_STRING)
}
