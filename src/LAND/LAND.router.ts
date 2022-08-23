import { env } from 'decentraland-commons'
import { server } from 'decentraland-server'
import FormData from 'form-data'
import { Request } from 'express'
//@ts-ignore
import * as contentHash from 'content-hash'
import fetch, { Response as FetchResponse } from 'node-fetch'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { Router } from '../common/Router'
import { withSchemaValidation } from '../middleware'
import { getCID } from '../utils/cid'
import {
  GetRedirectionContentHashResponse,
  getRedirectionContentHashSchema,
  Redirection,
  UploadRedirectionResponse,
  uploadRedirectionSchema,
} from './LAND.types'

export class LANDRouter extends Router {
  mount() {
    this.router.post(
      '/lands/redirection',
      withSchemaValidation(uploadRedirectionSchema),
      server.handleRequest(this.uploadRedirection)
    )

    this.router.post(
      '/lands/redirection/contentHash',
      withSchemaValidation(getRedirectionContentHashSchema),
      server.handleRequest(this.getRedirectionContentHash)
    )
  }

  private uploadRedirection = async (
    req: Request
  ): Promise<UploadRedirectionResponse> => {
    const url = env.get('IPFS_URL')
    const projectId = env.get('IPFS_PROJECT_ID')
    const apiKey = env.get('IPFS_API_KEY')

    if (!url) {
      throw new Error('IPFS_URL not defined')
    }

    if (!apiKey) {
      throw new Error('IPFS_API_KEY not defined')
    }

    const redirection: Redirection = server.extractFromReq(req, 'redirection')

    const redirectionFile = this.generateRedirectionFile(redirection)

    const formData = new FormData()

    formData.append('blob', redirectionFile, 'index.html')

    let result: FetchResponse

    try {
      result = await fetch(url + '/api/v0/add?pin=false', {
        method: 'post',
        body: formData,
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${projectId}:${apiKey}`
          ).toString('base64')}`,
        },
      })
    } catch (e) {
      throw new HTTPError(
        'Failed to upload file to IPFS # Request',
        {},
        STATUS_CODES.error
      )
    }

    if (!result.ok) {
      throw new HTTPError(
        'Failed to upload file to IPFS # Response',
        {},
        STATUS_CODES.error
      )
    }

    const { Hash } = await result.json()

    return {
      ...redirection,
      contentHash: await contentHash.fromIpfs(Hash),
    }
  }

  private getRedirectionContentHash = async (
    req: Request
  ): Promise<GetRedirectionContentHashResponse> => {
    const redirections: Redirection[] = server.extractFromReq(
      req,
      'redirections'
    )

    const output: GetRedirectionContentHashResponse = []

    for (const redirection of redirections) {
      const redirectionFile = this.generateRedirectionFile(redirection)

      const ipfsHash = await getCID({
        path: 'index.html',
        content: redirectionFile,
        size: redirectionFile.byteLength,
      })

      output.push({
        ...redirection,
        contentHash: await contentHash.fromIpfs(ipfsHash),
      })
    }

    return output
  }

  private generateRedirectionFile = ({
    landURL,
    i18nCouldNotRedirectMsg,
    i18nClickHereMsg,
  }: Redirection): Buffer => {
    const html: string = `<html>
    <head>
      <meta
        http-equiv="refresh"
        content="0; URL=${landURL}"
      />
    </head>
    <body>
      <p>
        ${i18nCouldNotRedirectMsg}
        <a href="${landURL}">
          ${i18nClickHereMsg}
        </a>.
      </p>
    </body>
    </html>`

    return Buffer.from(html)
  }
}
