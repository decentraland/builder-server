import { Request } from 'express'
import { server } from 'decentraland-server'

import { unsafeParseInt } from '../utils/parse'

export class RequestParameters {
  req: Request

  constructor(req: Request) {
    this.req = req
  }

  getQueryString() {
    return this.req.query
  }

  has(param: string) {
    try {
      server.extractFromReq(this.req, param)
      return true
    } catch (error) {
      return false
    }
  }

  get<T>(param: string, defaultValue?: T) {
    try {
      return server.extractFromReq<T>(this.req, param)
    } catch (error) {
      if (defaultValue === undefined) throw error
      return defaultValue
    }
  }

  getString(param: string, defaultValue?: string) {
    return this.get<string>(param, defaultValue).toString()
  }

  getInteger(param: string, defaultValue?: number) {
    let value

    try {
      value = server.extractFromReq(this.req, param)
    } catch (error) {
      if (defaultValue === undefined) throw error
      return defaultValue
    }

    try {
      return unsafeParseInt(value)
    } catch (_) {
      throw new Error(
        `Invalid param "${param}" should be a integer but got "${value}"`
      )
    }
  }

  getBoolean(param: string, defaultValue?: boolean) {
    let value

    try {
      value = server.extractFromReq(this.req, param)
    } catch (error) {
      if (defaultValue === undefined) throw error
      return defaultValue
    }

    value = value === 'true' ? true : value === 'false' ? false : null

    if (value === null) {
      throw new Error(
        `Invalid param "${param}" should be a boolean but got "${value}"`
      )
    }
    return value
  }
}
