import { ACL, ACLValues, isValidFileSize, uploadFile } from './s3'

type File = Express.Multer.File

export async function uploadRequestFiles(
  files: { [fieldname: string]: File[] } | File[],
  getFileKey: (file: File) => Promise<string>,
  options: Partial<{ acl: ACLValues; mimeTypes: string[] }> = {}
): Promise<File[]> {
  // We don't care about the response type here, we're just awaiting on the promises
  const uploadPromises: Promise<Object>[] = []
  const acl = options.acl || ACL.publicRead

  // Transform the files into an array of files
  // req.files can be either an object with: { [fieldName]: Express.MulterS3.File[] } or an array of Express.MulterS3.File[]
  // depending on which method you use, multer().array() or multer().fields().
  // The field name is still accessible on each File
  // If you're using fields() with a maxCount bigger than 1, you might want to use the original req.files object to do any further processing
  files = Array.isArray(files) ? files : Object.values(files).flat()

  for (const file of files) {
    if (
      !isValidFileSize(file.size) ||
      !isValidMimeType(file.mimetype, options.mimeTypes)
    ) {
      throw new Error(
        `Invalid file ${file.fieldname}. Check the file size and mimetype.`
      )
    }

    uploadPromises.push(
      getFileKey(file).then((hash) => uploadFile(hash, file.buffer, acl))
    )
  }

  await Promise.all(uploadPromises)

  return files
}

function isValidMimeType(
  mimeTypeToCheck: string,
  validMimeTypes: string[] = [mimeTypeToCheck]
) {
  return validMimeTypes
    .map((mimeType) => mimeType.toLowerCase())
    .includes(mimeTypeToCheck.toLowerCase())
}
