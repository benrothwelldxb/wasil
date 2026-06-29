/**
 * Defence-in-depth for uploaded files.
 *
 * MIME type alone is client-controlled, so a malicious client can send
 * `Content-Type: application/pdf` for an `.exe`. We verify two extra
 * layers:
 *
 *   1. The filename extension matches the declared MIME (so `.exe` masquerading
 *      as `application/pdf` is rejected).
 *   2. The leading magic bytes of the buffer match the declared MIME
 *      (so an actual EXE renamed to .pdf with the right Content-Type is also
 *      rejected).
 *
 * Not every MIME we accept has a stable magic signature (text formats, SVG,
 * Word .doc), so we sniff the formats with reliable headers and trust the
 * extension+MIME pair for the rest. This catches the realistic attacks
 * without a heavyweight `file-type` dependency.
 */

// Allowed (extension → MIME) pairs. Multiple extensions per MIME are listed.
const EXTENSION_TO_MIMES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  csv: ['text/csv', 'application/csv', 'application/vnd.ms-excel'],
  txt: ['text/plain'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  svg: ['image/svg+xml'],
  mp4: ['video/mp4'],
  mov: ['video/quicktime'],
  mp3: ['audio/mpeg'],
  wav: ['audio/wav'],
  zip: ['application/zip'],
  rar: ['application/x-rar-compressed', 'application/vnd.rar'],
}

function extensionMatchesMime(filename: string, mime: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  const allowed = EXTENSION_TO_MIMES[ext]
  if (!allowed) return false
  return allowed.includes(mime.toLowerCase())
}

// Magic-byte sniffers. Functions return true if the buffer plausibly matches.
function startsWith(buf: Buffer, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false
  for (let i = 0; i < bytes.length; i++) {
    if (buf[i] !== bytes[i]) return false
  }
  return true
}

const SNIFFERS: Record<string, (buf: Buffer) => boolean> = {
  'application/pdf': buf => startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d]), // %PDF-
  'image/jpeg': buf => startsWith(buf, [0xff, 0xd8, 0xff]),
  'image/png': buf => startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/gif': buf => startsWith(buf, [0x47, 0x49, 0x46, 0x38]) && (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61,
  'image/webp': buf =>
    buf.length >= 12 &&
    startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && // RIFF
    buf.subarray(8, 12).toString('ascii') === 'WEBP',
  'image/svg+xml': buf => {
    // SVG is text — accept if the first 2KB include an <svg tag and no <script
    const head = buf.subarray(0, 2048).toString('utf-8').toLowerCase()
    if (!head.includes('<svg')) return false
    // Block obvious XSS vectors in SVGs uploaded to a school context
    if (head.includes('<script') || head.includes('javascript:')) return false
    return true
  },
  // Office Open XML formats are zip containers
  'application/zip': buf => startsWith(buf, [0x50, 0x4b, 0x03, 0x04]),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    buf => startsWith(buf, [0x50, 0x4b, 0x03, 0x04]),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    buf => startsWith(buf, [0x50, 0x4b, 0x03, 0x04]),
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    buf => startsWith(buf, [0x50, 0x4b, 0x03, 0x04]),
  // Legacy Office formats (OLE2 compound document)
  'application/msword':
    buf => startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  'application/vnd.ms-excel':
    buf => startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  'application/vnd.ms-powerpoint':
    buf => startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  'video/mp4': buf => buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp',
  'video/quicktime': buf => buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp',
}

export interface UploadCheck {
  valid: boolean
  reason?: string
}

/**
 * Validate an uploaded file. Returns `{ valid: true }` on success, or
 * `{ valid: false, reason }` if it fails any of the layered checks.
 *
 * `allowedMimes` is the per-route allowlist (caller already restricts the
 * MIME types accepted on that endpoint). This function adds the extension
 * match + magic-byte sniff on top.
 */
export function checkUpload(
  buffer: Buffer,
  declaredMime: string,
  filename: string,
  allowedMimes: string[],
): UploadCheck {
  const mime = declaredMime.toLowerCase()
  if (!allowedMimes.map(m => m.toLowerCase()).includes(mime)) {
    return { valid: false, reason: 'mime not allowed' }
  }
  if (!extensionMatchesMime(filename, mime)) {
    return { valid: false, reason: 'file extension does not match declared type' }
  }
  const sniffer = SNIFFERS[mime]
  if (sniffer && !sniffer(buffer)) {
    return { valid: false, reason: 'file content does not match declared type' }
  }
  return { valid: true }
}
