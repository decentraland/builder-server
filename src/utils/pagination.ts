import { Request } from 'express'

export const DEFAULT_LIMIT = 10000

export const getPaginationParams = (req: Request) => {
  const { limit, page } = req.query
  const parsedLimit = Number(limit)
  const parsedPage = Number(page)
  return {
    limit: limit && !isNaN(parsedLimit) ? parsedLimit : undefined,
    page: page && !isNaN(parsedPage) ? parsedPage : undefined,
  }
}

export const getOffset = (page?: number, limit?: number) => {
  return limit && page ? limit * (page - 1) : undefined
}

export const generatePaginatedResponse = <T>(
  results: T,
  total: number,
  limit: number,
  page: number
) => {
  const pages = Math.ceil(total / Number(limit))

  return {
    total,
    limit,
    pages,
    page,
    results,
  }
}
