import { env } from 'decentraland-commons'
import cors, { CorsOptions } from 'cors'

let CORS_ORIGIN: string | RegExp | (string | RegExp)[] = env.get(
  'CORS_ORIGIN',
  '*'
)
const CORS_METHOD = env.get('CORS_METHOD', '*')

if (CORS_ORIGIN.split(';').length > 1) {
  CORS_ORIGIN = CORS_ORIGIN.split(';')
    .map((origin) => origin.trim())
    .map((origin) =>
      origin.startsWith('regex:')
        ? new RegExp(origin.replace('regex:', ''))
        : origin
    )
} else if (CORS_ORIGIN.startsWith('regex:')) {
  CORS_ORIGIN = new RegExp(CORS_ORIGIN.replace('regex:', ''))
}

const corsOptions: CorsOptions = {
  origin: CORS_ORIGIN,
  methods: CORS_METHOD,
  allowedHeaders: '*',
  exposedHeaders: [
    'ETag',
    'Cache-Control',
    'Content-Language',
    'Content-Type',
    'Expires',
    'Last-Modified',
    'Pragma',
  ],
}

export const withCors = cors(corsOptions)
export const withPermissiveCors = cors({
  origin: '*',
  methods: '*',
  allowedHeaders: '*',
  exposedHeaders: '*',
})
