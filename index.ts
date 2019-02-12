import bodyParser = require('body-parser')
import express = require('express')
import { env } from 'decentraland-commons'

const SERVER_PORT = env.get('SERVER_PORT', 5000)
const app = express()

app.use(bodyParser.urlencoded({ extended: false, limit: '2mb' }))
app.use(bodyParser.json())

if (env.isDevelopment()) {
  app.use(function(_, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Request-Method', '*')
    res.setHeader(
      'Access-Control-Allow-Methods',
      'OPTIONS, GET, POST, PUT, DELETE'
    )
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    next()
  })
}

if (require.main === module) {
  startServer()
}

function startServer() {
  return app.listen(SERVER_PORT, () =>
    console.log('Server running on port', SERVER_PORT)
  )
}
