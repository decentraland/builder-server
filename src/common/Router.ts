import express = require('express')
import { ExpressApp } from './ExpressApp'

export class Router {
  protected app: express.Application

  constructor(app: ExpressApp | express.Application) {
    this.app = app instanceof ExpressApp ? app.get() : app
  }

  mount(): void {
    throw new Error('Not implemented')
  }
}
