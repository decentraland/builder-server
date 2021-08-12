import express = require('express')
import { IMetricsComponent } from '@well-known-components/interfaces'

import { ExpressApp } from './ExpressApp'

export class Router<M extends string = string> {
  protected readonly router: express.Router
  protected readonly metrics: IMetricsComponent<M> | undefined

  constructor(
    router: ExpressApp | express.Router,
    metrics?: IMetricsComponent<M>
  ) {
    this.router = router instanceof ExpressApp ? router.getRouter() : router
    this.metrics = metrics
  }

  mount(): void {
    throw new Error('Not implemented')
  }
}
