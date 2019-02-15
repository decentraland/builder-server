import { utils } from 'decentraland-commons'
import { Entry } from './types'

export function parseEntry(entryJSON: string): Entry {
  const entry: Entry = JSON.parse(entryJSON)
  let errors: string[] = []

  switch (entry.version.toString()) {
    case '1':
      const { project, contest, scene } = entry
      if (!project || !contest || !scene) {
        throw new Error(
          'Missing required props. Check your entry contains a project, contest and scene props'
        )
      }

      errors = [
        getProjectErrors(project),
        getContestErrors(contest),
        getSceneErrors(scene)
      ]
      break
    default:
      throw new Error(
        `Unknown version, received entry version: ${entry.version}`
      )
  }

  const errorsStr = errors.join('\n').trim()
  if (errorsStr) throw new Error(errorsStr)

  return trimEntry(entry)
}

function trimEntry(entry: Entry): Entry {
  return {
    ...entry,
    project: utils.omit(entry.project, ['thumbnail'])
  }
}

function getProjectErrors(project: Entry['project']): string {
  const errors = validateProps(project, ['id', 'title'])
  return errors.length > 0 ? `Project:\n${formatErrors(errors)}` : ''
}

function getContestErrors(contest: Entry['contest']): string {
  const errors = validateProps(contest, ['email'])
  return errors.length > 0 ? `Contest:\n${formatErrors(errors)}` : ''
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

function formatErrors(errors: string[]): string {
  return errors.map(error => `\t- ${error}`).join('')
}

export function validateProps(object: Object, props: string[]): string[] {
  const errors = []
  for (const prop in props) {
    if (typeof object === 'undefined') {
      errors.push(`Missing ${prop}`)
    }
  }
  return errors
}
