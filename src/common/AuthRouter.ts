import express = require('express')
import basicAuth = require('express-basic-auth')
import { PathParams, RequestHandlerParams } from 'express-serve-static-core'
import { env } from 'decentraland-commons'

import { Router } from './Router'
import { ExpressApp } from './ExpressApp'

export type Auth = {
  username: string
  password: string
}
type HTTPMethod = 'get' | 'post' | 'put' | 'delete'

export class AuthRouter extends Router {
  protected username: string
  protected password: string

  constructor(router: ExpressApp | express.Router, auth: Auth) {
    super(router)
    this.username = auth.username
    this.password = auth.password

    if (!env.isDevelopment() && (!this.username || !this.password)) {
      throw new Error(`Missing username or password in basic auth credentials`)
    }

    this.patchRouter()
  }

  patchRouter() {
    const arr: HTTPMethod[] = ['get', 'post', 'put', 'delete']
    const users = { [this.username]: this.password }

    const authMiddleware =
      this.username && this.password
        ? basicAuth({ users, challenge: true })
        : (_: any, __: any, next: express.NextFunction) => next()

    for (const method of arr) {
      const oldHandler = this.router[method].bind(this.router)

      this.router[method] = (
        path: PathParams,
        ...handlers: RequestHandlerParams[]
      ) => {
        return oldHandler(path, authMiddleware, ...handlers)
      }
    }
  }
}
