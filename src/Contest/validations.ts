import { Submission } from './types'

export function parseSubmission(submissionJSON: string): Submission {
  const submission: Submission = JSON.parse(submissionJSON)
  let errors: string[] = []

  switch (submission.version) {
    case '1':
      const { project, contest, scene } = submission
      if (!project || !contest || !scene) {
        throw new Error(
          'Missing required props. Check your submission contains a project, contest and scene props'
        )
      }

      errors = [
        getProjectErrors(project),
        getContestErrors(contest),
        getSceneErrors(scene)
      ]
      break
    default:
      throw new Error('Missing version')
  }

  const errorsStr = errors.join('\n').trim()
  if (errorsStr) throw new Error(errorsStr)

  return submission
}

function getProjectErrors(project: Submission['project']): string {
  const errors = validateProps(project, ['id', 'title'])
  return errors.length ? `Project:\n${errors.map(error => `\t- ${error}`)}` : ''
}

function getContestErrors(contest: Submission['contest']): string {
  const errors = validateProps(contest, ['email'])
  return errors.length ? `Contest:\n${formatErrors(errors)}` : ''
}

function getSceneErrors(scene: Submission['scene']): string {
  const errors = validateProps(scene, ['components', 'entities'])

  let componentErrors: string[] = []
  let entityErrors: string[] = []

  if (errors.length === 0) {
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

  return `Scene:\n${formatErrors(errors)}\n${formatErrors(
    componentErrors
  )}\n${formatErrors(entityErrors)}`
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
