import express = require('express')
import { server } from 'decentraland-server'

import { Router } from '../common'

export class AppRouter extends Router {
  mount() {
    this.router.get('/info', server.handleRequest(this.getVersion))
  }

  getVersion(_req: express.Request) {
    return {
      version: process.env.npm_package_version
    }
  }
}
