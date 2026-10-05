import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
})

const BUCKET = process.env.S3_BUCKET!
const PUBLIC_URL = process.env.S3_PUBLIC_URL

function getPublicUrl(key: string): string {
  if (PUBLIC_URL) {
    return `${PUBLIC_URL}/${key}`
  }
  return `${process.env.S3_ENDPOINT}/${BUCKET}/${key}`
}

export async function uploadFile(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))

  return getPublicUrl(key)
}

export async function getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  })
  return getSignedUrl(s3, command, { expiresIn })
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }))
}

/**
 * The R2 object key behind a stored file URL.
 *
 *   https://<account>.r2.cloudflarestorage.com/reports/abc.pdf -> reports/abc.pdf
 *
 * Returns null for anything that is not a URL — legacy rows hold local paths
 * like "/uploads/policies/abc.pdf", which have no object to delete. Null means
 * "nothing to remove here", never "failed".
 *
 * Lived as a private copy in policies.ts and as an UNGUARDED one-liner in
 * files.ts, where `new URL()` on a legacy path throws and takes the delete down
 * with it. One copy, here, because every caller is deleting a file and the cost
 * of getting it wrong is an object that outlives its row.
 */
export function extractKeyFromUrl(fileUrl: string): string | null {
  try {
    return new URL(fileUrl).pathname.replace(/^\//, '')
  } catch {
    return null
  }
}

export function generateKey(prefix: string, originalName: string): string {
  const ext = originalName.split('.').pop() || 'bin'
  return `${prefix}/${crypto.randomUUID()}.${ext}`
}
