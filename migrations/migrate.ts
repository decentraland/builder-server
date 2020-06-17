#!/usr/bin/env ts-node

import * as path from 'path'
import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import { env } from 'decentraland-commons'

export function migrate(
  commandArguments: string[],
  migrationsDir: string = __dirname
) {
  const CONNECTION_STRING = env.get('CONNECTION_STRING', '')

  if (!CONNECTION_STRING) {
    throw new Error(
      'Please set a CONNECTION_STRING env variable before running migrations'
    )
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
    ...commandArguments
  ]

  const child = spawn(
    path.resolve(migrationsDir, 'node-pg-migrate'),
    spawnArgs,
    {
      env: { ...process.env, CONNECTION_STRING }
    }
  )

  const emitter = new EventEmitter()

  emitter.on('log', console.log)

  console.log('Running command:')
  console.dir(`node-pg-migrate ${spawnArgs.join(' ')}`)

  child.on('error', function (error) {
    emitter.emit('log', error.message)
  })

  child.stdout.on('data', function (data) {
    console.log('here stdout', data)
    emitter.emit('log', data.toString())
  })

  child.stderr.on('data', function (data) {
    console.log('here stderr', data)
    emitter.emit('log', data.toString())
  })

  child.on('close', (code: number, signal: string) => {
    console.log(`child process exited with code: ${code} and signal: ${signal}`)
  })

  console.log('Returninng child process')

  return child
}

if (require.main === module) {
  migrate(process.argv.slice(2), path.resolve(__dirname, '../migrations'))
}
