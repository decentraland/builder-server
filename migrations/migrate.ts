#!/usr/bin/env ts-node

import * as path from 'path'
import { spawn } from 'child_process'
import { env } from 'decentraland-commons'

export function migrate(
  commandArguments: string[],
  migrationsDir: string = __dirname
) {
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

  const spawnArgs = [
    '--database-url-var',
    'CONNECTION_STRING',
    '--migration-file-language',
    'ts',
    '--migrations-dir',
    migrationsDir,
    '--ignore-pattern',
    '\\..*|.*migrate(.ts)?',
    ...commandArguments,
  ]

  console.log('Running command:')
  console.dir(`node-pg-migrate ${spawnArgs.join(' ')}`)

  const child = spawn(
    path.resolve(migrationsDir, 'node-pg-migrate'),
    spawnArgs,
    {
      env: { ...process.env, CONNECTION_STRING: connectionString },
    }
  )

  child.on('error', function (error) {
    console.log(error.message)
  })

  child.stdout.on('data', function (data) {
    console.log(data.toString())
  })

  child.stderr.on('data', function (data) {
    console.log(data.toString())
  })

  child.on('close', (code: number, signal: string) => {
    console.log(`child process exited with code: ${code} and signal: ${signal}`)
  })

  return child
}

if (require.main === module) {
  migrate(process.argv.slice(2), path.resolve(__dirname, '../migrations'))
}
