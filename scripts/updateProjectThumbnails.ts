import { db } from '../src/database'
import { Project, THUMBNAIL_FILE_NAME } from '../src/Project'
import { Pool } from '../src/Pool'
import { S3Project, ACL, MANIFEST_FILENAME, POOL_FILENAME } from '../src/S3'

const thumbnail = `${THUMBNAIL_FILE_NAME}.png`

export async function updateProjectThumbnails() {
  console.log('==== Projects ====')
  await updateThumbnails(Project)

  console.log('==== Pools ====')
  await updateThumbnails(Pool)

  console.log('==== S3 ====')
  await updateS3()
}

async function updateThumbnails(Model: typeof Project | typeof Pool) {
  const resources = await Model.find()

  const updates = []
  for (const resource of resources) {
    console.log(`Updating project ${resource.id} with thumbnail "${thumbnail}"`)
    updates.push(Model.update({ thumbnail }, { id: resource.id }))
  }

  return Promise.all(updates)
}

async function updateS3() {
  const projects = await Project.find()

  const updates = []

  for (const project of projects) {
    const s3Project = new S3Project(project.id)

    const [manifest, poolManifest] = await Promise.all([
      s3Project.readFileBody(MANIFEST_FILENAME),
      s3Project.readFileBody(POOL_FILENAME),
    ])

    if (manifest) {
      updates.push(
        updateManifestThumbnail(manifest.toString(), MANIFEST_FILENAME)
      )
    }

    if (poolManifest) {
      updates.push(
        updateManifestThumbnail(poolManifest.toString(), POOL_FILENAME)
      )
    }
  }

  return Promise.all(updates)
}

async function updateManifestThumbnail(
  manifest: string,
  manifestFilename: string
) {
  const manifestJSON = JSON.parse(manifest)
  const project = manifestJSON.project

  if (project.thumbnail) {
    project.thumbnail = thumbnail

    console.log(
      `Updating manifest "${manifestFilename}" for project ${project.id}`
    )
    return new S3Project(project.id).saveFile(
      manifestFilename,
      Buffer.from(JSON.stringify(manifestJSON)),
      ACL.private
    )
  }
  return Promise.resolve()
}

if (require.main === module) {
  db.connect()
    .then(updateProjectThumbnails)
    .then(() => {
      console.log('All done!')
      process.exit()
    })
    .catch((err: Error) => {
      console.error(err)
      process.exit()
    })
}
