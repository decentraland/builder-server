import express from 'express'
import fs from 'fs'
import cors from 'cors'
import http from 'http'
import https from 'https'
import { collectDefaultMetrics } from 'prom-client'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { getDefaultHttpMetrics } from '@well-known-components/metrics/dist/http'

var privateKey  = fs.readFileSync('../credentials/localhost-key.pem');
var certificate = fs.readFileSync('../credentials/localhost.pem');

export class ExpressApp {
  protected app: express.Application
  protected router: express.Router

  constructor() {
    this.app = express()
    this.router = express.Router()
  }

  useJSON() {
    this.app.use(
      express.urlencoded({ extended: false, limit: '2mb' }),
      express.json({ limit: '5mb' })
    )
    return this
  }

  useCORS(origin: string, method: string) {
    const corsOptions = {
      origin: origin,
      methods: method,
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
    this.app.use(cors(corsOptions))
    return this
  }

  useVersion(version: string) {
    this.app.use(`/${version}`, this.router)
    return this
  }

  useMetrics() {
    const base = createTestMetricsComponent(getDefaultHttpMetrics())
    const register = base.register

    const bearerToken = process.env.WKC_METRICS_BEARER_TOKEN

    // Metrics should not use /{version} until we add the `metrics` property to the CI.
    this.app.use(
      '/metrics',
      async (req: express.Request, res: express.Response) => {
        if (bearerToken) {
          const header = req.header('authorization')
          if (!header) {
            res.status(401).end()
            return
          }
          if (Array.isArray(header)) {
            res.status(401).end()
            return
          }
          const [, value] = header.split(' ')
          if (value !== bearerToken) {
            res.status(401).end()
            return
          }
        }

        res.setHeader('content-type', register.contentType)
        return res.send(await register.metrics())
      }
    )

    const metrics = async (
      req: express.Request,
      res: express.Response,
      next: Function
    ) => {
      let labels = {
        method: req.method,
        handler: '',
        code: 200,
      }

      const { end } = base.startTimer('http_request_duration_seconds', labels)

      res.on('finish', () => {
        labels.code = (res && res.statusCode) || labels.code

        if (req.route && req.route.path) {
          labels.handler = (req.baseUrl || '') + req.route.path
        }

        const contentLength = res.getHeader('content-length')
        if (typeof contentLength === 'string') {
          base.observe(
            'http_request_size_bytes',
            labels,
            parseInt(contentLength, 10)
          )
        }
        base.increment('http_requests_total', labels)
        end(labels)
      })

      next()
    }

    collectDefaultMetrics({ register })

    this.router.all('*', metrics)
    return this
  }

  use(...handlers: express.RequestHandler[] | express.ErrorRequestHandler[]) {
    this.app.use(...handlers)
    return this
  }

  listen(port: string | number) {
    var httpServer = http.createServer(this.app);
    var httpsServer = https.createServer({ key: privateKey, cert:certificate }, this.app);
    return new Promise((resolve) => {
      httpServer.listen(port, undefined, () => console.log("HTTP Server running on port", port))
      httpsServer.listen(8443, undefined, undefined, () => console.log("HTTPS Server running on port", 8443))
      resolve(port)
    })
  }

  getApp() {
    return this.app
  }

  getRouter() {
    return this.router
  }
}
