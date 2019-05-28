import { Entry } from './types'
import { formatErrors, validateProps } from '../common/validations'

export function parseEntry(entryJSON: string): Entry {
  const entry: Entry = JSON.parse(entryJSON)
  let errors: string[] = []

  switch (entry.version.toString()) {
    case '1':
      const { project, user, scene } = entry

      if (!project || !user || !scene) {
        throw new Error(
          'Missing required props. Check your entry contains a project, user and scene props'
        )
      }

      errors = [
        getProjectErrors(project),
        getUserErrors(user),
        getSceneErrors(scene)
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

  return entry
}

function getProjectErrors(project: Entry['project']): string {
  const errors = validateProps(project, ['id', 'title'])
  return errors.length > 0 ? `Project:\n${formatErrors(errors)}` : ''
}

function getSceneErrors(scene: Entry['scene']): string {
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

function getUserErrors(user: Entry['user']): string {
  const errors = validateProps(user, ['id', 'email'])
  return errors.length > 0 ? `User:\n${formatErrors(errors)}` : ''
}
