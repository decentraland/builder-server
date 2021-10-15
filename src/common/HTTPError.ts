export const STATUS_CODES = {
  ok: 200,
  badRequest: 400,
  unauthorized: 401,
  notFound: 404,
  locked: 423,
  conflict: 409,
  error: 500,
}
export type StatusCode = typeof STATUS_CODES[keyof typeof STATUS_CODES]

export class HTTPError extends Error {
  data: any
  statusCode: StatusCode

  constructor(
    message: string,
    data?: any,
    statusCode: StatusCode = STATUS_CODES.error
  ) {
    super(message)
    this.data = data
    this.statusCode = statusCode
  }

  setData(data: any) {
    this.data = data
    return this
  }

  setStatusCode(statusCode: StatusCode) {
    this.statusCode = statusCode
    return this
  }
}
