import { listFiles, readFile, uploadFile, ACL } from '../src/S3'

async function main() {
  const projectFiles = await listFiles('projects/')

  for (const projectFile of projectFiles) {
    const key = projectFile.Key
    if (key && key.endsWith('pool.json')) {
      console.log(`Reading pool file ${key}`)
      const pool = await readFile(key)

      if (pool.Body) {
        console.log('Parsing and uploading')
        const newPool = JSON.parse(pool.Body.toString())
        await uploadFile(key, Buffer.from(newPool), ACL.publicRead)
      } else {
        console.log('Could not find any Body')
      }
    }
  }
}

if (require.main === module) {
  main()
    .then(() => console.log('All done'))
    .catch((err: Error) => console.error(err))
}
