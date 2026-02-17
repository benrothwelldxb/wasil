/**
 * Migration Script: Convert Child records to Student + ParentStudentLink
 *
 * This script migrates existing Child records to the new Student model
 * and creates ParentStudentLink records to maintain parent-child relationships.
 *
 * Run with: npx tsx scripts/migrate-children-to-students.ts
 *
 * The script is idempotent - it will skip students that already exist
 * (matched by first name, last name, and class).
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface MigrationStats {
  childrenProcessed: number
  studentsCreated: number
  studentsSkipped: number
  linksCreated: number
  linksSkipped: number
  errors: string[]
}

async function migrateChildrenToStudents(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    childrenProcessed: 0,
    studentsCreated: 0,
    studentsSkipped: 0,
    linksCreated: 0,
    linksSkipped: 0,
    errors: [],
  }

  console.log('Starting migration of Child records to Students...\n')

  // Get all children with their parent and class information
  const children = await prisma.child.findMany({
    include: {
      parent: {
        select: {
          id: true,
          email: true,
          schoolId: true,
        },
      },
      class: {
        select: {
          id: true,
          name: true,
          schoolId: true,
        },
      },
    },
  })

  console.log(`Found ${children.length} Child records to migrate\n`)

  for (const child of children) {
    stats.childrenProcessed++

    try {
      // Parse name into firstName and lastName
      const nameParts = child.name.trim().split(/\s+/)
      const firstName = nameParts[0] || child.name
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''

      // Check if a student with this name already exists in this class
      let student = await prisma.student.findFirst({
        where: {
          firstName,
          lastName,
          classId: child.classId,
          schoolId: child.class.schoolId,
        },
      })

      if (student) {
        console.log(`  Student already exists: ${firstName} ${lastName} in ${child.class.name}`)
        stats.studentsSkipped++
      } else {
        // Create new student
        student = await prisma.student.create({
          data: {
            firstName,
            lastName,
            classId: child.classId,
            schoolId: child.class.schoolId,
          },
        })
        console.log(`  Created student: ${firstName} ${lastName} in ${child.class.name}`)
        stats.studentsCreated++
      }

      // Check if ParentStudentLink already exists
      const existingLink = await prisma.parentStudentLink.findUnique({
        where: {
          userId_studentId: {
            userId: child.parentId,
            studentId: student.id,
          },
        },
      })

      if (existingLink) {
        console.log(`    Link already exists for parent ${child.parent.email}`)
        stats.linksSkipped++
      } else {
        // Create ParentStudentLink
        await prisma.parentStudentLink.create({
          data: {
            userId: child.parentId,
            studentId: student.id,
          },
        })
        console.log(`    Created link for parent ${child.parent.email}`)
        stats.linksCreated++
      }
    } catch (error) {
      const errorMsg = `Error processing child "${child.name}" (ID: ${child.id}): ${error instanceof Error ? error.message : String(error)}`
      console.error(`  ERROR: ${errorMsg}`)
      stats.errors.push(errorMsg)
    }
  }

  return stats
}

async function main() {
  console.log('='.repeat(60))
  console.log('Child to Student Migration Script')
  console.log('='.repeat(60))
  console.log()

  try {
    const stats = await migrateChildrenToStudents()

    console.log()
    console.log('='.repeat(60))
    console.log('Migration Complete!')
    console.log('='.repeat(60))
    console.log()
    console.log('Summary:')
    console.log(`  Children processed: ${stats.childrenProcessed}`)
    console.log(`  Students created:   ${stats.studentsCreated}`)
    console.log(`  Students skipped:   ${stats.studentsSkipped}`)
    console.log(`  Links created:      ${stats.linksCreated}`)
    console.log(`  Links skipped:      ${stats.linksSkipped}`)
    console.log(`  Errors:             ${stats.errors.length}`)

    if (stats.errors.length > 0) {
      console.log()
      console.log('Errors:')
      stats.errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`))
    }

    console.log()
    console.log('Note: The original Child records have been preserved.')
    console.log('You can remove them later once you verify the migration was successful.')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
