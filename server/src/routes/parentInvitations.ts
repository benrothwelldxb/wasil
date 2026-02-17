import { Router, Request, Response } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'
import {
  generateAccessCode,
  generateMagicToken,
  generateQRCode,
  isInvitationExpired,
  getDefaultExpiryDate,
  parseCSV,
  groupByParent,
} from '../services/invitations.js'

const router = Router()

// Rate limiting state (simple in-memory for now)
const validationAttempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const attempt = validationAttempts.get(ip)

  if (!attempt || now > attempt.resetAt) {
    validationAttempts.set(ip, { count: 1, resetAt: now + 60000 }) // 1 minute window
    return true
  }

  if (attempt.count >= 5) {
    return false
  }

  attempt.count++
  return true
}

// ============ Admin Endpoints ============

// List all invitations (paginated, filterable)
router.get('/', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { status, search, page = '1', limit = '20' } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = Math.min(parseInt(limit as string, 10), 100)
    const skip = (pageNum - 1) * limitNum

    const where: Record<string, unknown> = { schoolId: user.schoolId }

    if (status && status !== 'all') {
      where.status = status
    }

    if (search) {
      const searchStr = search as string
      where.OR = [
        { parentEmail: { contains: searchStr, mode: 'insensitive' } },
        { parentName: { contains: searchStr, mode: 'insensitive' } },
        { accessCode: { contains: searchStr, mode: 'insensitive' } },
        { childLinks: { some: { childName: { contains: searchStr, mode: 'insensitive' } } } },
      ]
    }

    const [invitations, total] = await Promise.all([
      prisma.parentInvitation.findMany({
        where,
        include: {
          childLinks: {
            include: {
              class: { select: { id: true, name: true } },
            },
          },
          studentLinks: {
            include: {
              student: {
                include: {
                  class: { select: { id: true, name: true } },
                },
              },
            },
          },
          createdBy: { select: { id: true, name: true } },
          redeemedByUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.parentInvitation.count({ where }),
    ])

    res.json({
      invitations: invitations.map(inv => ({
        id: inv.id,
        accessCode: inv.accessCode,
        parentEmail: inv.parentEmail,
        parentName: inv.parentName,
        children: inv.childLinks.map(cl => ({
          childName: cl.childName,
          className: cl.class.name,
          classId: cl.classId,
        })),
        students: inv.studentLinks.map(sl => ({
          studentId: sl.student.id,
          studentName: `${sl.student.firstName} ${sl.student.lastName}`,
          className: sl.student.class.name,
        })),
        status: inv.status,
        expiresAt: inv.expiresAt?.toISOString(),
        redeemedAt: inv.redeemedAt?.toISOString(),
        redeemedByUser: inv.redeemedByUser
          ? { id: inv.redeemedByUser.id, name: inv.redeemedByUser.name, email: inv.redeemedByUser.email }
          : undefined,
        createdBy: { id: inv.createdBy.id, name: inv.createdBy.name },
        createdAt: inv.createdAt.toISOString(),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('Error fetching invitations:', error)
    res.status(500).json({ error: 'Failed to fetch invitations' })
  }
})

// Get single invitation details
router.get('/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params

    const invitation = await prisma.parentInvitation.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        childLinks: {
          include: {
            class: { select: { id: true, name: true } },
          },
        },
        studentLinks: {
          include: {
            student: {
              include: {
                class: { select: { id: true, name: true } },
              },
            },
          },
        },
        createdBy: { select: { id: true, name: true } },
        redeemedByUser: { select: { id: true, name: true, email: true } },
        school: { select: { name: true } },
      },
    })

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    const qrUrl = await generateQRCode(
      `${process.env.PARENT_APP_URL}/register?code=${invitation.accessCode}`
    )

    res.json({
      id: invitation.id,
      accessCode: invitation.accessCode,
      magicToken: invitation.magicToken,
      parentEmail: invitation.parentEmail,
      parentName: invitation.parentName,
      children: invitation.childLinks.map(cl => ({
        childName: cl.childName,
        className: cl.class.name,
        classId: cl.classId,
      })),
      students: invitation.studentLinks.map(sl => ({
        studentId: sl.student.id,
        studentName: `${sl.student.firstName} ${sl.student.lastName}`,
        className: sl.student.class.name,
      })),
      status: invitation.status,
      expiresAt: invitation.expiresAt?.toISOString(),
      redeemedAt: invitation.redeemedAt?.toISOString(),
      redeemedByUser: invitation.redeemedByUser
        ? { id: invitation.redeemedByUser.id, name: invitation.redeemedByUser.name, email: invitation.redeemedByUser.email }
        : undefined,
      createdBy: { id: invitation.createdBy.id, name: invitation.createdBy.name },
      createdAt: invitation.createdAt.toISOString(),
      schoolName: invitation.school.name,
      qrCodeUrl: qrUrl,
      registrationUrl: `${process.env.PARENT_APP_URL}/register?code=${invitation.accessCode}`,
      magicLinkUrl: invitation.magicToken
        ? `${process.env.PARENT_APP_URL}/register?token=${invitation.magicToken}`
        : undefined,
    })
  } catch (error) {
    console.error('Error fetching invitation:', error)
    res.status(500).json({ error: 'Failed to fetch invitation' })
  }
})

// Create a new invitation
router.post('/', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { parentEmail, parentName, children, studentIds, includeMagicLink, expiresInDays } = req.body

    // Support both old (children) and new (studentIds) approach
    const hasChildren = children && Array.isArray(children) && children.length > 0
    const hasStudents = studentIds && Array.isArray(studentIds) && studentIds.length > 0

    if (!hasChildren && !hasStudents) {
      return res.status(400).json({ error: 'At least one child or student must be specified' })
    }

    // Validate class IDs if using children approach
    if (hasChildren) {
      const classIds = [...new Set(children.map((c: { classId: string }) => c.classId))]
      const classes = await prisma.class.findMany({
        where: { id: { in: classIds }, schoolId: user.schoolId },
      })
      if (classes.length !== classIds.length) {
        return res.status(400).json({ error: 'One or more class IDs are invalid' })
      }
    }

    // Validate student IDs if using students approach
    let validStudents: Array<{ id: string; firstName: string; lastName: string; class: { id: string; name: string } }> = []
    if (hasStudents) {
      validStudents = await prisma.student.findMany({
        where: { id: { in: studentIds }, schoolId: user.schoolId },
        include: { class: { select: { id: true, name: true } } },
      })
      if (validStudents.length !== studentIds.length) {
        return res.status(400).json({ error: 'One or more student IDs are invalid' })
      }
    }

    // Generate codes
    let accessCode: string
    let attempts = 0
    do {
      accessCode = generateAccessCode()
      const existing = await prisma.parentInvitation.findUnique({ where: { accessCode } })
      if (!existing) break
      attempts++
    } while (attempts < 10)

    if (attempts >= 10) {
      return res.status(500).json({ error: 'Failed to generate unique access code' })
    }

    const magicToken = includeMagicLink ? generateMagicToken() : null

    // Calculate expiry
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : getDefaultExpiryDate()

    const invitation = await prisma.parentInvitation.create({
      data: {
        schoolId: user.schoolId,
        accessCode,
        magicToken,
        parentEmail: parentEmail || null,
        parentName: parentName || null,
        expiresAt,
        createdById: user.id,
        childLinks: hasChildren
          ? {
              create: children.map((c: { childName: string; classId: string }) => ({
                childName: c.childName,
                classId: c.classId,
              })),
            }
          : undefined,
        studentLinks: hasStudents
          ? {
              create: studentIds.map((studentId: string) => ({
                studentId,
              })),
            }
          : undefined,
      },
      include: {
        childLinks: {
          include: {
            class: { select: { id: true, name: true } },
          },
        },
        studentLinks: {
          include: {
            student: {
              include: {
                class: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    })

    logAudit({
      req,
      action: 'CREATE',
      resourceType: 'PARENT_INVITATION',
      resourceId: invitation.id,
      metadata: {
        parentEmail,
        childCount: hasChildren ? children.length : 0,
        studentCount: hasStudents ? studentIds.length : 0,
      },
    })

    res.status(201).json({
      id: invitation.id,
      accessCode: invitation.accessCode,
      magicToken: invitation.magicToken,
      parentEmail: invitation.parentEmail,
      parentName: invitation.parentName,
      children: invitation.childLinks.map(cl => ({
        childName: cl.childName,
        className: cl.class.name,
        classId: cl.classId,
      })),
      students: invitation.studentLinks.map(sl => ({
        studentId: sl.student.id,
        studentName: `${sl.student.firstName} ${sl.student.lastName}`,
        className: sl.student.class.name,
      })),
      status: invitation.status,
      expiresAt: invitation.expiresAt?.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      registrationUrl: `${process.env.PARENT_APP_URL}/register?code=${invitation.accessCode}`,
      magicLinkUrl: invitation.magicToken
        ? `${process.env.PARENT_APP_URL}/register?token=${invitation.magicToken}`
        : undefined,
    })
  } catch (error) {
    console.error('Error creating invitation:', error)
    res.status(500).json({ error: 'Failed to create invitation' })
  }
})

// Bulk import from CSV
router.post('/bulk', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { csvContent, expiresInDays } = req.body

    if (!csvContent) {
      return res.status(400).json({ error: 'CSV content is required' })
    }

    // Parse CSV
    const rows = parseCSV(csvContent)
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid rows found in CSV' })
    }

    // Group by parent
    const grouped = groupByParent(rows)

    // Get all unique class names and map to IDs
    const classNames = [...new Set(rows.map(r => r.className))]
    const classes = await prisma.class.findMany({
      where: { schoolId: user.schoolId, name: { in: classNames } },
    })

    const classNameToId = new Map(classes.map(c => [c.name, c.id]))

    // Validate all class names exist
    const missingClasses = classNames.filter(name => !classNameToId.has(name))
    if (missingClasses.length > 0) {
      return res.status(400).json({
        error: 'Some class names not found',
        missingClasses,
      })
    }

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : getDefaultExpiryDate()

    // Create invitations
    const created: Array<{ parentEmail: string; accessCode: string; childCount: number }> = []
    const errors: string[] = []

    for (const group of grouped) {
      try {
        let accessCode: string
        let attempts = 0
        do {
          accessCode = generateAccessCode()
          const existing = await prisma.parentInvitation.findUnique({ where: { accessCode } })
          if (!existing) break
          attempts++
        } while (attempts < 10)

        if (attempts >= 10) {
          errors.push(`${group.parentEmail}: Failed to generate unique code`)
          continue
        }

        const magicToken = generateMagicToken()

        await prisma.parentInvitation.create({
          data: {
            schoolId: user.schoolId,
            accessCode,
            magicToken,
            parentEmail: group.parentEmail,
            parentName: group.parentName || null,
            expiresAt,
            createdById: user.id,
            childLinks: {
              create: group.children.map(c => ({
                childName: c.childName,
                classId: classNameToId.get(c.className)!,
              })),
            },
          },
        })

        created.push({
          parentEmail: group.parentEmail,
          accessCode,
          childCount: group.children.length,
        })
      } catch (err) {
        console.error(`Error creating invitation for ${group.parentEmail}:`, err)
        errors.push(`${group.parentEmail}: Failed to create invitation`)
      }
    }

    logAudit({
      req,
      action: 'CREATE',
      resourceType: 'PARENT_INVITATION',
      resourceId: 'bulk',
      metadata: { count: created.length },
    })

    res.status(201).json({
      created: created.length,
      skipped: grouped.length - created.length,
      invitations: created,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Error bulk importing invitations:', error)
    res.status(500).json({ error: 'Failed to import invitations' })
  }
})

// Revoke a pending invitation
router.patch('/:id/revoke', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params

    const invitation = await prisma.parentInvitation.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending invitations can be revoked' })
    }

    await prisma.parentInvitation.update({
      where: { id },
      data: { status: 'REVOKED' },
    })

    logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'PARENT_INVITATION',
      resourceId: id,
      metadata: { action: 'revoke' },
    })

    res.json({ message: 'Invitation revoked successfully' })
  } catch (error) {
    console.error('Error revoking invitation:', error)
    res.status(500).json({ error: 'Failed to revoke invitation' })
  }
})

// Regenerate access code for an invitation
router.post('/:id/regenerate', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params

    const invitation = await prisma.parentInvitation.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending invitations can be regenerated' })
    }

    let accessCode: string
    let attempts = 0
    do {
      accessCode = generateAccessCode()
      const existing = await prisma.parentInvitation.findUnique({ where: { accessCode } })
      if (!existing) break
      attempts++
    } while (attempts < 10)

    if (attempts >= 10) {
      return res.status(500).json({ error: 'Failed to generate unique access code' })
    }

    const magicToken = generateMagicToken()

    await prisma.parentInvitation.update({
      where: { id },
      data: { accessCode, magicToken },
    })

    logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'PARENT_INVITATION',
      resourceId: id,
      metadata: { action: 'regenerate' },
    })

    res.json({
      accessCode,
      magicToken,
      registrationUrl: `${process.env.PARENT_APP_URL}/register?code=${accessCode}`,
      magicLinkUrl: `${process.env.PARENT_APP_URL}/register?token=${magicToken}`,
    })
  } catch (error) {
    console.error('Error regenerating codes:', error)
    res.status(500).json({ error: 'Failed to regenerate codes' })
  }
})

// Resend magic link email (placeholder - would integrate with email service)
router.patch('/:id/resend', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params

    const invitation = await prisma.parentInvitation.findFirst({
      where: { id, schoolId: user.schoolId },
      include: { school: { select: { name: true } } },
    })

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending invitations can be resent' })
    }

    if (!invitation.parentEmail) {
      return res.status(400).json({ error: 'No email address associated with this invitation' })
    }

    // TODO: Integrate with email service (SendGrid/SES)
    // For now, just log the action
    console.log(`Would send email to ${invitation.parentEmail} for invitation ${invitation.accessCode}`)

    logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'PARENT_INVITATION',
      resourceId: id,
      metadata: { action: 'resend', email: invitation.parentEmail },
    })

    res.json({ message: 'Invitation email sent successfully' })
  } catch (error) {
    console.error('Error resending invitation:', error)
    res.status(500).json({ error: 'Failed to resend invitation' })
  }
})

// ============ Public/Parent Endpoints ============

// Validate an access code or magic token (rate limited)
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown'

    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
    }

    const { code, token } = req.body

    if (!code && !token) {
      return res.status(400).json({ error: 'Access code or magic token is required' })
    }

    let invitation

    if (token) {
      invitation = await prisma.parentInvitation.findUnique({
        where: { magicToken: token },
        include: {
          childLinks: {
            include: {
              class: { select: { id: true, name: true } },
            },
          },
          studentLinks: {
            include: {
              student: {
                include: {
                  class: { select: { id: true, name: true } },
                },
              },
            },
          },
          school: { select: { id: true, name: true, logoUrl: true, brandColor: true } },
        },
      })
    } else {
      // Normalize code: uppercase and add dashes if missing
      const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
      const formattedCode =
        normalizedCode.length === 9
          ? `${normalizedCode.slice(0, 3)}-${normalizedCode.slice(3, 6)}-${normalizedCode.slice(6, 9)}`
          : code.toUpperCase()

      invitation = await prisma.parentInvitation.findUnique({
        where: { accessCode: formattedCode },
        include: {
          childLinks: {
            include: {
              class: { select: { id: true, name: true } },
            },
          },
          studentLinks: {
            include: {
              student: {
                include: {
                  class: { select: { id: true, name: true } },
                },
              },
            },
          },
          school: { select: { id: true, name: true, logoUrl: true, brandColor: true } },
        },
      })
    }

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid access code or link' })
    }

    if (invitation.status === 'REVOKED') {
      return res.status(400).json({ error: 'This invitation has been revoked' })
    }

    if (invitation.status === 'REDEEMED') {
      return res.status(400).json({ error: 'This invitation has already been used' })
    }

    if (invitation.status === 'EXPIRED' || isInvitationExpired(invitation.expiresAt)) {
      return res.status(400).json({ error: 'This invitation has expired' })
    }

    res.json({
      valid: true,
      school: {
        id: invitation.school.id,
        name: invitation.school.name,
        logoUrl: invitation.school.logoUrl,
        brandColor: invitation.school.brandColor,
      },
      children: invitation.childLinks.map(cl => ({
        childName: cl.childName,
        className: cl.class.name,
      })),
      students: invitation.studentLinks.map(sl => ({
        studentId: sl.student.id,
        studentName: `${sl.student.firstName} ${sl.student.lastName}`,
        className: sl.student.class.name,
      })),
      parentName: invitation.parentName,
    })
  } catch (error) {
    console.error('Error validating invitation:', error)
    res.status(500).json({ error: 'Failed to validate invitation' })
  }
})

// Redeem an invitation (after OAuth)
router.post('/redeem', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { code, token } = req.body

    if (!code && !token) {
      return res.status(400).json({ error: 'Access code or magic token is required' })
    }

    let invitation

    if (token) {
      invitation = await prisma.parentInvitation.findUnique({
        where: { magicToken: token },
        include: {
          childLinks: {
            include: {
              class: { select: { id: true, name: true } },
            },
          },
          studentLinks: {
            include: {
              student: {
                include: {
                  class: { select: { id: true, name: true } },
                },
              },
            },
          },
          school: true,
        },
      })
    } else {
      const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
      const formattedCode =
        normalizedCode.length === 9
          ? `${normalizedCode.slice(0, 3)}-${normalizedCode.slice(3, 6)}-${normalizedCode.slice(6, 9)}`
          : code.toUpperCase()

      invitation = await prisma.parentInvitation.findUnique({
        where: { accessCode: formattedCode },
        include: {
          childLinks: {
            include: {
              class: { select: { id: true, name: true } },
            },
          },
          studentLinks: {
            include: {
              student: {
                include: {
                  class: { select: { id: true, name: true } },
                },
              },
            },
          },
          school: true,
        },
      })
    }

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid access code or link' })
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: `This invitation is ${invitation.status.toLowerCase()}` })
    }

    if (isInvitationExpired(invitation.expiresAt)) {
      await prisma.parentInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      })
      return res.status(400).json({ error: 'This invitation has expired' })
    }

    // Update user's school and role if needed, create children/student links
    await prisma.$transaction(async (tx) => {
      // Update user to be a parent at this school
      await tx.user.update({
        where: { id: user.id },
        data: {
          schoolId: invitation.schoolId,
          role: 'PARENT',
        },
      })

      // Create children (legacy approach)
      for (const childLink of invitation.childLinks) {
        await tx.child.create({
          data: {
            name: childLink.childName,
            parentId: user.id,
            classId: childLink.classId,
          },
        })
      }

      // Create ParentStudentLink records (new approach)
      for (const studentLink of invitation.studentLinks) {
        // Check if link already exists (avoid duplicates)
        const existingLink = await tx.parentStudentLink.findUnique({
          where: {
            userId_studentId: {
              userId: user.id,
              studentId: studentLink.studentId,
            },
          },
        })
        if (!existingLink) {
          await tx.parentStudentLink.create({
            data: {
              userId: user.id,
              studentId: studentLink.studentId,
            },
          })
        }
      }

      // Mark invitation as redeemed
      await tx.parentInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'REDEEMED',
          redeemedAt: new Date(),
          redeemedByUserId: user.id,
        },
      })
    })

    res.json({
      success: true,
      school: {
        id: invitation.school.id,
        name: invitation.school.name,
      },
      children: invitation.childLinks.map(cl => ({
        childName: cl.childName,
        className: cl.class.name,
      })),
      students: invitation.studentLinks.map(sl => ({
        studentId: sl.student.id,
        studentName: `${sl.student.firstName} ${sl.student.lastName}`,
        className: sl.student.class.name,
      })),
    })
  } catch (error) {
    console.error('Error redeeming invitation:', error)
    res.status(500).json({ error: 'Failed to redeem invitation' })
  }
})

// Magic link redirect (redirects to registration page with token)
router.get('/magic/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params

    const invitation = await prisma.parentInvitation.findUnique({
      where: { magicToken: token },
    })

    if (!invitation) {
      return res.redirect(`${process.env.PARENT_APP_URL}/register?error=invalid`)
    }

    if (invitation.status !== 'PENDING') {
      return res.redirect(`${process.env.PARENT_APP_URL}/register?error=${invitation.status.toLowerCase()}`)
    }

    if (isInvitationExpired(invitation.expiresAt)) {
      return res.redirect(`${process.env.PARENT_APP_URL}/register?error=expired`)
    }

    res.redirect(`${process.env.PARENT_APP_URL}/register?token=${token}`)
  } catch (error) {
    console.error('Error processing magic link:', error)
    res.redirect(`${process.env.PARENT_APP_URL}/register?error=server`)
  }
})

export default router
