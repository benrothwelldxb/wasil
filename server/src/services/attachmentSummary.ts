// What a message with no words says in a list.
//
// An attachment on its own is a message — a parent photographing a letter, a
// teacher sending a reading record — and the sender often has nothing to add.
// But a thread preview built from the text is then empty, and a blank row reads
// as a bug rather than as a photo.
//
// It lives here, once, because three separate readers would otherwise each
// invent their own: the parent's thread list, the push notification body, and
// Desk's inbox row. Three clients guessing produces three different sentences
// for the same message, and the one that guesses "" produces none at all.
//
// Deliberately not the file NAME. "IMG_4821.HEIC" tells a parent nothing they
// could not see from the thumbnail, and a signed form called "scan0003.pdf"
// tells them less than "Sent a file".

/** "Sent a photo" / "Sent 3 files" / "" when there is nothing attached. */
export function describeAttachments(files: Array<{ fileType?: string }>): string {
  if (files.length === 0) return ''
  const allImages = files.every(f => (f.fileType || '').startsWith('image/'))
  const allVideos = files.every(f => (f.fileType || '').startsWith('video/'))
  if (files.length === 1) {
    if (allImages) return 'Sent a photo'
    if (allVideos) return 'Sent a video'
    return 'Sent a file'
  }
  if (allImages) return `Sent ${files.length} photos`
  if (allVideos) return `Sent ${files.length} videos`
  return `Sent ${files.length} files`
}
