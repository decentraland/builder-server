import { Request, Response, NextFunction } from 'express'
import { server } from 'decentraland-server'

import { Project } from '../Project'

export async function projectExists(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const id = server.extractFromReq(req, 'id')

  if (!(await Project.exists(id))) {
    const response = JSON.stringify({
      ok: false,
      error: `Couldn't find a project for "${id}"`
    })

    res.setHeader('Content-Type', 'application/json')
    res.status(404).end(response)
    return
  }

  next()
}
