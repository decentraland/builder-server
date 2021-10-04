import express from 'express'

export const asyncHandler = (fn: any) => (
  req?: express.Request,
  res?: express.Response,
  next?: express.NextFunction
): Promise<unknown> => {
  return Promise.resolve(fn(req, res, next)).catch(next)
}
