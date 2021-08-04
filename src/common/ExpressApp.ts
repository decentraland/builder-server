import express from 'express'
import { collectDefaultMetrics } from 'prom-client'
import { createTestMetricsComponent } from '@well-known-components/metrics'

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
    const cors = function (
      _req: express.Request,
      res: express.Response,
      next: Function
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Request-Method', method)
      res.setHeader(
        'Access-Control-Allow-Methods',
        'OPTIONS, GET, POST, PUT, DELETE'
      )
      res.setHeader('Access-Control-Allow-Headers', '*')
      res.setHeader(
        'Access-Control-Expose-Headers',
        'ETag, Cache-Control, Content-Language, Content-Type, Expires, Last-Modified, Pragma'
      )

      next()
    }
    this.app.use(cors)
    this.router.all('*', cors)
    return this
  }

  useVersion(version: string) {
    this.app.use(`/${version}`, this.router)
    return this
  }

  useMetrics(base: ReturnType<typeof createTestMetricsComponent>) {
    const register = base.register

    const bearerToken = process.env.WKC_METRICS_BEARER_TOKEN

    // Metrics should not use /{version} until we add the `metrics` property to the CI.
    this.app.use(
      '/metrics',
      async (req: express.Request, res: express.Response) => {
        if (bearerToken) {
          const header = req.header('authorization')
          if (!header) {
            res.end(401)
            return
          }
          if (Array.isArray(header)) {
            res.end(401)
            return
          }
          const [, value] = header.split(' ')
          if (value !== bearerToken) {
            res.end(401)
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

  use(...handers: express.RequestHandler[]) {
    this.app.use(...handers)
    return this
  }

  listen(port: string | number) {
    this.app.listen(port, () => console.log('Server running on port', port))
  }

  getApp() {
    return this.app
  }

  getRouter() {
    return this.router
  }
}
