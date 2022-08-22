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
import { RedirectionData, uploadRedirectionSchema } from './LAND.types'

export class LANDRouter extends Router {
  mount() {
    this.router.post(
      '/lands/redirection',
      withSchemaValidation(uploadRedirectionSchema),
      server.handleRequest(this.uploadRedirection)
    )

    this.router.get(
      '/lands/eip1557ContentHash',
      server.handleRequest(this.getEIP1557ContentHash)
    )
  }

  private uploadRedirection = async (req: Request) => {
    const url = env.get('IPFS_URL')
    const projectId = env.get('IPFS_PROJECT_ID')
    const apiKey = env.get('IPFS_API_KEY')

    if (!url) {
      throw new Error('IPFS_URL not defined')
    }

    if (!apiKey) {
      throw new Error('IPFS_API_KEY not defined')
    }

    const data: RedirectionData = server.extractFromReq(req, 'data')

    const redirectionFile = this.generateRedirectionFile(data)

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
      hash: Hash,
    }
  }

  private getEIP1557ContentHash = async (req: Request) => {
    const data: RedirectionData = {
      landURL: server.extractFromReq(req, 'landURL'),
      msg1: server.extractFromReq(req, 'msg1'),
      msg2: server.extractFromReq(req, 'msg2'),
    }

    const redirectionFile = this.generateRedirectionFile(data)

    const ipfsHash = await getCID({
      path: 'index.html',
      content: redirectionFile,
      size: redirectionFile.byteLength,
    })

    const hash = await contentHash.fromIpfs(ipfsHash)

    return {
      hash,
    }
  }

  private generateRedirectionFile = ({
    landURL,
    msg1,
    msg2,
  }: RedirectionData): Buffer => {
    const html: string = `<html>
    <head>
      <meta
        http-equiv="refresh"
        content="0; URL=${landURL}"
      />
    </head>
    <body>
      <p>
        ${msg1}
        <a href="${landURL}">
          ${msg2}
        </a>.
      </p>
    </body>
    </html>`

    return Buffer.from(html)
  }
}
