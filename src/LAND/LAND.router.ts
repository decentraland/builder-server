import { server } from 'decentraland-server'
import FormData from 'form-data'
import { Request } from 'express'
//@ts-ignore
import * as contentHash from 'content-hash'
import fetch, { Response as FetchResponse } from 'node-fetch'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { Router } from '../common/Router'
import { getCID } from '../utils/cid'
import {
  GetRedirectionHashesResponse,
  UploadRedirectionResponse,
} from './LAND.types'
import { getLandRouterEnvs } from './utils'

export const MAX_COORDS = 150
const INDEX_FILE = 'index.html'

export class LANDRouter extends Router {
  mount() {
    this.router.get(
      '/lands/redirectionHashes',
      server.handleRequest(this.getRedirectionHashes)
    )

    this.router.post(
      '/lands/:coords/redirection',
      server.handleRequest(this.uploadRedirection)
    )
  }

  private uploadRedirection = async (
    req: Request
  ): Promise<UploadRedirectionResponse> => {
    const {
      ipfsUrl,
      ipfsProjectId,
      ipfsApiKey,
      explorerUrl,
    } = getLandRouterEnvs()

    const coords = server.extractFromReq(req, 'coords')

    this.validateCoords(coords)

    const locale = req.headers['accept-language']

    const redirectionFile = this.generateRedirectionFile(
      coords,
      explorerUrl,
      locale
    )

    const formData = new FormData()

    formData.append('blob', redirectionFile, INDEX_FILE)

    let result: FetchResponse

    try {
      result = await fetch(ipfsUrl + '/api/v0/add?pin=false', {
        method: 'post',
        body: formData,
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${ipfsProjectId}:${ipfsApiKey}`
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
      ipfsHash: Hash,
      contentHash: await contentHash.fromIpfs(Hash),
    }
  }

  private getRedirectionHashes = async (
    req: Request
  ): Promise<GetRedirectionHashesResponse> => {
    const { explorerUrl } = getLandRouterEnvs()

    let coordsListQP: string | string[]

    try {
      coordsListQP = server.extractFromReq<string | string[]>(req, 'coords')
    } catch (e: any) {
      throw new HTTPError(e.message, {}, STATUS_CODES.badRequest)
    }

    const coordsList =
      typeof coordsListQP === 'string' ? [coordsListQP] : coordsListQP

    if (coordsList.length > MAX_COORDS) {
      throw new HTTPError(
        `Max ${MAX_COORDS} coords`,
        { amount: coordsList.length },
        STATUS_CODES.badRequest
      )
    }

    const locale = req.headers['accept-language']

    const output: GetRedirectionHashesResponse = []

    for (const coords of coordsList) {
      this.validateCoords(coords)

      const redirectionFile = this.generateRedirectionFile(
        coords,
        explorerUrl,
        locale
      )

      const ipfsHash = await getCID({
        path: INDEX_FILE,
        content: redirectionFile,
        size: redirectionFile.byteLength,
      })

      const [x, y] = coords.split(',').map((val) => Number(val))

      output.push({
        x,
        y,
        ipfsHash,
        contentHash: await contentHash.fromIpfs(ipfsHash),
      })
    }

    return output
  }

  private validateCoords = (coords: string): void => {
    if (!/^-?[1-9]\d*,-?[1-9]\d*$/.test(coords)) {
      throw new HTTPError(
        'Invalid coordinates',
        { coords },
        STATUS_CODES.badRequest
      )
    }
  }

  private generateRedirectionFile = (
    coords: string,
    explorerUrl: string,
    locale?: string
  ): Buffer => {
    let messages: [string, string]

    switch (locale) {
      case 'zh-CN':
        messages = ['如果您未重定向', '点击这里']
        break
      case 'es-ES':
        messages = ['Si no estas siendo redirigido', 'Has click aquí']
        break
      default:
        messages = ['If you are not redirected', 'Click here']
    }

    const html: string = `<html>
    <head>
      <meta
        http-equiv="refresh"
        content="0; URL=${explorerUrl}?position=${coords}"
      />
    </head>
    <body>
      <p>
        ${messages[0]}
        <a href="${explorerUrl}?position=${coords}">
          ${messages[1]}
        </a>.
      </p>
    </body>
    </html>`

    return Buffer.from(html)
  }
}
