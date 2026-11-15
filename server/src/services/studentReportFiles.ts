import prisma from './prisma.js'
import { deleteFile, extractKeyFromUrl } from './storage.js'

/**
 * Remove every report belonging to these students, FILE FIRST, THEN ROW.
 *
 * Call this before deleting a student. StudentReport cascades on the student,
 * so deleting the student alone drops the rows and leaves each PDF in R2,
 * behind a public URL, fetchable by anyone who ever opened it. That is the same
 * defect fixed for a single report delete in #148, reached by another road.
 *
 * Report by report, so a failure part-way leaves only the reports whose files
 * are still there. Nothing is swallowed: if a file cannot be removed this
 * throws, the caller does not delete the student, and the delete can be
 * retried. S3 DeleteObject succeeds on an absent key, so the retry is safe.
 *
 * A null key is a legacy local path with no object behind it, which counts
 * as removed.
 */
export async function deleteReportsForStudents(studentIds: string[]): Promise<number> {
  if (studentIds.length === 0) return 0
  const reports = await prisma.studentReport.findMany({
    where: { studentId: { in: studentIds } },
    select: { id: true, fileUrl: true },
  })
  for (const report of reports) {
    const key = extractKeyFromUrl(report.fileUrl)
    if (key) await deleteFile(key)
    await prisma.studentReport.delete({ where: { id: report.id } })
  }
  return reports.length
}
