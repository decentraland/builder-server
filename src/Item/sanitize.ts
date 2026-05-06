import { ItemAttributes, ItemContents } from './Item.types'

// CIDv1 base32 hash of empty (0-byte) content.
// makeContentFiles in the builder app drops Blobs with size === 0,
// and the Catalyst content-validator rejects entities that reference
// files not present in the content payload.
const EMPTY_CONTENT_HASH =
  'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'

export function isValidContentEntry(key: string, hash: string): boolean {
  return !key.endsWith('/') && hash !== EMPTY_CONTENT_HASH
}

/**
 * Removes directory entries (paths ending with '/') and 0-byte files
 * from an item's contents map and its representations' contents arrays.
 * Returns a new object — does not mutate the input.
 */
export function sanitizeItemContents<
  T extends Pick<ItemAttributes, 'contents' | 'data'>
>(item: T): T {
  // 1. Filter item.contents (the file→hash map)
  const cleanContents: ItemContents = {}
  for (const [key, hash] of Object.entries(item.contents)) {
    if (isValidContentEntry(key, hash)) {
      cleanContents[key] = hash
    }
  }

  // 2. Filter representations in item.data
  const validFiles = new Set(Object.keys(cleanContents))
  const cleanData = { ...item.data }

  if (
    'representations' in cleanData &&
    Array.isArray(cleanData.representations)
  ) {
    cleanData.representations = cleanData.representations.map((rep: any) => ({
      ...rep,
      contents: Array.isArray(rep.contents)
        ? rep.contents.filter((f: string) => validFiles.has(f))
        : rep.contents,
    }))
  }

  return {
    ...item,
    contents: cleanContents,
    data: cleanData,
  }
}
