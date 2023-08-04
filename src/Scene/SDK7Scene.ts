import { ContentMapping, EntityType } from '@dcl/schemas'
import { ProjectAttributes } from '../Project'
import { Layout, SceneSDK7Attributes } from './Scene.types'
import { buildEntityAndFile } from 'dcl-catalyst-client/dist/client/utils/DeploymentBuilder'

export class SDK7Scene {
  scene: SceneSDK7Attributes

  constructor(scene: SceneSDK7Attributes) {
    this.scene = scene
  }

  getComposite() {
    return this.scene.composite
  }

  getLayout(): Layout {
    return this.getComposite().components.find(
      ({ name }) => name === 'inspector::Scene'
    )?.data[0].json.layout
  }

  getParcelsAsString(): string[] {
    return this.getLayout().parcels.map((parcel) => `${parcel.x},${parcel.y}`)
  }

  getDefinition(project: ProjectAttributes) {
    const base = this.getLayout().base
    return {
      owner: '',
      main: 'bin/game.js',
      display: {
        title: project.title,
        favicon: 'favicon_asset',
      },
      tags: [],
      scene: {
        parcels: this.getParcelsAsString(),
        base: `${base.x},${base.y}`,
      },
      source: {
        version: 1,
        origin: 'builder',
        point: base,
        projectId: project.id,
        layout: {
          rows: project.rows,
          cols: project.cols,
        },
      },
    }
  }

  async getEntity(project: ProjectAttributes) {
    const content = Object.keys(this.scene.mappings).reduce((files, key) => {
      files.push({ file: key, hash: this.scene.mappings[key] })
      return files
    }, [] as ContentMapping[])
    const { entity } = await buildEntityAndFile({
      pointers: this.getLayout().parcels.map(
        (parcel: any) => `${parcel.x},${parcel.y}`
      ),
      type: EntityType.SCENE,
      content,
      timestamp: Date.now(),
      metadata: this.getDefinition(project),
    })
    return entity
  }
}
