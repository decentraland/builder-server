import { Request } from 'express'

export const DEFAULT_LIMIT = 100000 // let's use the default as the max as well

export const getPaginationParams = (req: Request) => {
  const { limit, page } = req.query
  const parsedLimit = parseInt(limit as string, 10)
  const parsedPage = parseInt(page as string, 10)
  return {
    limit:
      limit && !isNaN(parsedLimit) && parsedLimit < DEFAULT_LIMIT
        ? parsedLimit
        : undefined,
    page: page && !isNaN(parsedPage) ? parsedPage : undefined,
  }
}

export const getOffset = (page: number, limit: number) => {
  return limit * (page - 1)
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
