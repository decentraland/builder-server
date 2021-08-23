import express = require('express')

import { ExpressApp } from './ExpressApp'

export class Router {
  protected router: express.Router

  constructor(router: ExpressApp | express.Router) {
    this.router = router instanceof ExpressApp ? router.getRouter() : router
  }

  mount(): void {
    throw new Error('Not implemented')
  }
}
