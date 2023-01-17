import { db } from 'decentraland-server'
import { env } from 'decentraland-commons'

const pg = db.clients.postgres

export const database: typeof pg = Object.create(pg)

pg.setTypeParser(1114, (date) => {
  const utcStr = `${date}Z`
  return new Date(utcStr).toISOString()
})

database.connect = async () => {
  let connectionString: string | undefined = env.get(
    'CONNECTION_STRING',
    undefined
  )

  if (!connectionString) {
    const dbUser = env.get('PG_COMPONENT_PSQL_USER')
    const dbDatabaseName = env.get('PG_COMPONENT_PSQL_DATABASE')
    const dbPort = env.get('PG_COMPONENT_PSQL_PORT')
    const dbHost = env.get('PG_COMPONENT_PSQL_HOST')
    const dbPassword = env.get('PG_COMPONENT_PSQL_PASSWORD')

    if (!dbUser || !dbDatabaseName || !dbPort || !dbHost || !dbPassword) {
      throw new Error('The DB parameters must be set')
    }
    connectionString = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbDatabaseName}`
  }

  return pg.connect(connectionString)
}
