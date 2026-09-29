import fetch from 'node-fetch'
import { env } from 'decentraland-commons'
import { ValidationManifest } from './AutoCuration.types'

export async function sendValidation(
  manifest: ValidationManifest
): Promise<void> {
  const baseUrl = env.get('COLLECTIONS_CURATION_SERVER_URL', '')
  if (!baseUrl) {
    throw new Error('COLLECTIONS_CURATION_SERVER_URL is not configured')
  }

  const response = await fetch(
    `${baseUrl.replace(/\/+$/, '')}/v1/validations`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.get('CCS_API_TOKEN', '')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(manifest),
    }
  )

  if (response.status !== 202) {
    throw new Error(
      `The collections curation server responded with ${response.status}`
    )
  }
}
