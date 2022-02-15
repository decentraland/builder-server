export function a() {}

// These methods are suspiciously similar to https://github.com/decentraland/builder/blob/master/src/modules/forum/utils.ts
// It should be deleted from there and used here once we tackle https://github.com/decentraland/builder/issues/1754

// export function buildCollectionForumPost(
//   collection: Collection,
//   items: Item[],
//   ownerName: string = ''
// ): ForumPost {
//   const collectionURL =
//     window.location.origin +
//     locations.itemEditor({ collectionId: collection.id })

//   // We only post in English
//   return {
//     title: `Collection '${collection.name}' created by ${
//       ownerName || shorten(collection.owner)
//     } is ready for review!`,
//     raw: `# ${collection.name}

// 	[View entire collection](${collectionURL})

// 	## Wearables

// 	${items.map(toRawItem).join('\n\n')}`,
//   }
// }

// function toRawItem(item: Item) {
//   const sections = []
//   if (item.description) {
//     sections.push(`- Description: ${item.description}`)
//   }
//   if (item.rarity) {
//     sections.push(`- Rarity: ${item.rarity}`)
//   }
//   if (item.data.category) {
//     sections.push(`- Category: ${item.data.category}`)
//   }
//   return `**${item.name}**
//       ${sections.join('\n')}
//       ![](${getThumbnailURL(item)})
//       [Link to editor](${window.location.origin}${locations.itemEditor({
//     itemId: item.id,
//   })})`
// }
