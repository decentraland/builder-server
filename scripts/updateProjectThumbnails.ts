import { db } from '../src/database'
import { Project, THUMBNAIL_FILE_NAME } from '../src/Project'
import { Pool } from '../src/Pool'

export async function updateProjectThumbnails() {
  console.log('==== Projects ====')
  await updateThumbnails(Project)

  console.log('==== Pools ====')
  await updateThumbnails(Pool)
}

async function updateThumbnails(Model: typeof Project | typeof Pool) {
  const resources = await Model.find()

  const updates = []
  for (const resource of resources) {
    const thumbnail = `${THUMBNAIL_FILE_NAME}.png`

    console.log(`Updating project ${resource.id} with thumbnail "${thumbnail}"`)
    updates.push(Model.update({ thumbnail }, { id: resource.id }))
  }

  return Promise.all(updates)
}

if (require.main === module) {
  db
    .connect()
    .then(updateProjectThumbnails)
    .then(() => {
      console.log('All done!')
      process.exit()
    })
}
