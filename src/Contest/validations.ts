import { utils } from 'decentraland-commons'

import { ContestEntry } from './types'
import { formatErrors, validateProps } from '../common/validations'

export function parseEntry(entryJSON: string): ContestEntry {
  const entry: ContestEntry = JSON.parse(entryJSON)
  let errors: string[] = []

  switch (entry.version.toString()) {
    case '1':
    case '2':
      const { project, contest, scene, user } = entry

      if (!user) {
        throw new Error('You might be using an old version of the Builder.')
      }
      if (!project || !contest || !scene) {
        throw new Error(
          'Missing required props. Check your entry contains a project, contest and scene props'
        )
      }

      errors = [
        getProjectErrors(project),
        getContestErrors(contest),
        getSceneErrors(scene),
        getUserErrors(user)
      ]
      break
    default:
      throw new Error(
        `Unknown version, received entry version: ${entry.version}`
      )
  }

  const errorsStr = errors.join('\n').trim()
  if (errorsStr) {
    throw new Error(errorsStr)
  }

  return trimEntry(entry)
}

function trimEntry(entry: ContestEntry): ContestEntry {
  return {
    ...entry,
    project: utils.omit(entry.project, ['thumbnail'])
  }
}

function getProjectErrors(project: ContestEntry['project']): string {
  const errors = validateProps(project, ['id', 'title'])
  return errors.length > 0 ? `Project:\n${formatErrors(errors)}` : ''
}

function getContestErrors(contest: ContestEntry['contest']): string {
  const errors = validateProps(contest, ['email'])
  return errors.length > 0 ? `Contest:\n${formatErrors(errors)}` : ''
}

function getSceneErrors(scene: ContestEntry['scene']): string {
  const sceneErrors = validateProps(scene, ['components', 'entities'])

  let componentErrors: string[] = []
  let entityErrors: string[] = []

  if (sceneErrors.length === 0) {
    for (const component of Object.values(scene.components)) {
      componentErrors = componentErrors.concat(
        validateProps(component, ['id', 'type', 'data'])
      )
    }

    for (const entity of Object.values(scene.entities)) {
      entityErrors = entityErrors.concat(
        validateProps(entity, ['id', 'components'])
      )
    }
  }

  let errors = ''

  if (sceneErrors.length) {
    errors += `Scene:\n${formatErrors(sceneErrors)}\n`
  }
  if (componentErrors.length) {
    errors += `Scene Components:${formatErrors(componentErrors)}}\n`
  }
  if (entityErrors.length) {
    errors += `Scene Entities:${formatErrors(entityErrors)}\n`
  }

  return errors
}

function getUserErrors(user: ContestEntry['user']): string {
  const errors = validateProps(user, ['id'])
  return errors.length > 0 ? `User:\n${formatErrors(errors)}` : ''
}
