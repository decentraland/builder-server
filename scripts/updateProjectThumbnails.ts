import { db } from '../src/database'
import { Project, THUMBNAIL_FILE_NAME } from '../src/Project'

export async function updateProjectThumbnails() {
  const projects = await Project.find()

  const updates = []
  for (const project of projects) {
    const thumbnail = `${THUMBNAIL_FILE_NAME}.png`

    console.log(`Updating project ${project.id} with thumbnail "${thumbnail}"`)
    updates.push(Project.update({ thumbnail }, { id: project.id }))
  }

  await Promise.all(updates)
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
