import express = require('express')
import bodyParser = require('body-parser')

export class ExpressApp {
  protected app: express.Application

  constructor() {
    this.app = express()
  }

  useJSON() {
    this.app.use(bodyParser.urlencoded({ extended: false, limit: '2mb' }))
    this.app.use(bodyParser.json())
    return this
  }

  useCORS() {
    this.app.use(function(_, res, next) {
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

  useVersion(version: string) {
    const router = express.Router()
    this.app.use(`/${version}`, router)
    return this
  }

  listen(port: string | number) {
    this.app.listen(port, () => console.log('Server running on port', port))
  }

  get() {
    return this.app
  }
}
