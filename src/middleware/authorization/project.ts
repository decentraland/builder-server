import { Request, Response, NextFunction } from 'express'
import { server } from 'decentraland-server'
import { AuthRequest } from '../authentication'
import { Project } from '../../Project'

export const projectAuthorization = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const id = server.extractFromReq(req, 'id')
  const user_id = (req as AuthRequest).auth.sub

  if (!user_id) {
    throw new Error(
      'Unauthenticated request. You need to use the authentication middlware before this one.'
    )
  }

  if (!(await Project.exists(id))) {
    res.status(404).end(JSON.stringify({ ok: false, error: 'Not found' }))
    return
  }

  if (!(await Project.isOwnedBy(id, user_id))) {
    res.status(401).end(JSON.stringify({ ok: false, error: 'Unauthorized' }))
    return
  }

  next()
}
