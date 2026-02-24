import { Router } from 'express'
import crypto from 'crypto'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin, isStaff } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'
import { sendNotification } from '../services/notify.js'

const router = Router()

function serializeForm(form: any, extra?: Record<string, unknown>) {
  return {
    id: form.id,
    title: form.title,
    description: form.description,
    type: form.type,
    status: form.status,
    fields: form.fields,
    targetClass: form.targetClass,
    classIds: form.classIds as string[],
    yearGroupIds: form.yearGroupIds as string[],
    schoolId: form.schoolId,
    expiresAt: form.expiresAt?.toISOString() || null,
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
    ...extra,
  }
}

function sendFormNotifications(req: any, form: any, schoolId: string) {
  const classIds = form.classIds as string[]
  const yearGroupIds = form.yearGroupIds as string[]

  if (form.targetClass === 'Whole School' || (classIds.length === 0 && yearGroupIds.length === 0)) {
    sendNotification({
      req,
      type: 'FORM',
      title: 'New Form',
      body: form.title,
      resourceType: 'FORM',
      resourceId: form.id,
      target: { targetClass: 'Whole School', schoolId },
    })
    return
  }

  // Send per class
  for (const classId of classIds) {
    sendNotification({
      req,
      type: 'FORM',
      title: 'New Form',
      body: form.title,
      resourceType: 'FORM',
      resourceId: form.id,
      target: { targetClass: form.targetClass, classId, schoolId },
    })
  }

  // Send per year group (only for year groups without specific classes already targeted)
  for (const yearGroupId of yearGroupIds) {
    sendNotification({
      req,
      type: 'FORM',
      title: 'New Form',
      body: form.title,
      resourceType: 'FORM',
      resourceId: form.id,
      target: { targetClass: form.targetClass, yearGroupId, schoolId },
    })
  }
}

// Get active forms (filtered by user's children's classes)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const childClassIds = user.children?.map((c: any) => c.classId) || []
    const now = new Date()

    const childClasses = childClassIds.length > 0
      ? await prisma.class.findMany({
          where: { id: { in: childClassIds } },
          select: { yearGroupId: true },
        })
      : []
    const childYearGroupIds = [...new Set(childClasses.map(c => c.yearGroupId).filter(Boolean))] as string[]

    // Fetch all active, non-expired forms for this school, then filter in JS
    const allForms = await prisma.form.findMany({
      where: {
        schoolId: user.schoolId,
        status: 'ACTIVE',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      include: {
        responses: {
          where: { userId: user.id },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Filter: show forms that target whole school, or any of the user's children's classes/year groups
    const forms = allForms.filter(form => {
      if (form.targetClass === 'Whole School') return true
      const formClassIds = form.classIds as string[]
      const formYearGroupIds = form.yearGroupIds as string[]
      if (formClassIds.some(id => childClassIds.includes(id))) return true
      if (formYearGroupIds.some(id => childYearGroupIds.includes(id))) return true
      return false
    })

    res.json(forms.map(form => serializeForm(form, {
      userResponse: form.responses[0] ? {
        id: form.responses[0].id,
        formId: form.responses[0].formId,
        userId: form.responses[0].userId,
        answers: form.responses[0].answers,
        createdAt: form.responses[0].createdAt.toISOString(),
      } : null,
    })))
  } catch (error) {
    console.error('Error fetching forms:', error)
    res.status(500).json({ error: 'Failed to fetch forms' })
  }
})

// Get available DRAFT forms (not yet attached to a message) for admin picker
router.get('/available', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const forms = await prisma.form.findMany({
      where: {
        schoolId: user.schoolId,
        status: 'DRAFT',
        message: null,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(forms.map(form => serializeForm(form)))
  } catch (error) {
    console.error('Error fetching available forms:', error)
    res.status(500).json({ error: 'Failed to fetch available forms' })
  }
})

// Get all forms with responses (admin)
router.get('/all', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const forms = await prisma.form.findMany({
      where: { schoolId: user.schoolId },
      include: {
        responses: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(forms.map(form => serializeForm(form, {
      responses: form.responses.map(r => ({
        id: r.id,
        answers: r.answers,
        userName: r.user.name,
        userEmail: r.user.email,
        createdAt: r.createdAt.toISOString(),
      })),
      responseCount: form.responses.length,
    })))
  } catch (error) {
    console.error('Error fetching all forms:', error)
    res.status(500).json({ error: 'Failed to fetch forms' })
  }
})

// Get available templates (staff+)
router.get('/templates', isStaff, async (_req, res) => {
  res.json({ message: 'Use FORM_TEMPLATES from @wasil/shared' })
})

// Create form (admin only)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { title, description, type, status, fields, targetClass, classIds, yearGroupIds, expiresAt } = req.body

    const form = await prisma.form.create({
      data: {
        title,
        description: description || null,
        type,
        status: status || 'DRAFT',
        fields,
        targetClass,
        classIds: classIds || [],
        yearGroupIds: yearGroupIds || [],
        schoolId: user.schoolId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'FORM', resourceId: form.id, metadata: { title: form.title, type: form.type } })

    if (form.status === 'ACTIVE') {
      sendFormNotifications(req, form, user.schoolId)
    }

    res.status(201).json(serializeForm(form))
  } catch (error) {
    console.error('Error creating form:', error)
    res.status(500).json({ error: 'Failed to create form' })
  }
})

// Update form (admin only)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { title, description, type, status, fields, targetClass, classIds, yearGroupIds, expiresAt } = req.body

    const existing = await prisma.form.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Form not found' })
    }

    const form = await prisma.form.update({
      where: { id },
      data: {
        title,
        description: description || null,
        type: type ?? existing.type,
        status: status ?? existing.status,
        fields: fields ?? existing.fields,
        targetClass: targetClass ?? existing.targetClass,
        classIds: classIds !== undefined ? classIds : existing.classIds,
        yearGroupIds: yearGroupIds !== undefined ? yearGroupIds : existing.yearGroupIds,
        expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : existing.expiresAt,
      },
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'FORM', resourceId: form.id, metadata: { title: form.title } })

    if (existing.status !== 'ACTIVE' && form.status === 'ACTIVE') {
      sendFormNotifications(req, form, user.schoolId)
    }

    res.json(serializeForm(form))
  } catch (error) {
    console.error('Error updating form:', error)
    res.status(500).json({ error: 'Failed to update form' })
  }
})

// Delete form (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const existing = await prisma.form.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Form not found' })
    }

    await prisma.form.delete({ where: { id } })

    logAudit({ req, action: 'DELETE', resourceType: 'FORM', resourceId: id, metadata: { title: existing.title } })

    res.json({ message: 'Form deleted successfully' })
  } catch (error) {
    console.error('Error deleting form:', error)
    res.status(500).json({ error: 'Failed to delete form' })
  }
})

// Submit form response
router.post('/:id/respond', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { answers } = req.body

    const form = await prisma.form.findFirst({
      where: { id, status: 'ACTIVE' },
    })

    if (!form) {
      return res.status(404).json({ error: 'Form not found or not active' })
    }

    const fields = form.fields as any[]
    for (const field of fields) {
      if (field.required && (answers[field.id] === undefined || answers[field.id] === '' || answers[field.id] === null)) {
        return res.status(400).json({ error: `Field "${field.label}" is required` })
      }
    }

    const response = await prisma.formResponse.upsert({
      where: {
        formId_userId: {
          formId: id,
          userId: user.id,
        },
      },
      update: { answers },
      create: {
        formId: id,
        userId: user.id,
        answers,
      },
    })

    res.json({
      id: response.id,
      formId: response.formId,
      userId: response.userId,
      answers: response.answers,
      createdAt: response.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error submitting form response:', error)
    res.status(500).json({ error: 'Failed to submit response' })
  }
})

// Export form responses as CSV (admin only)
router.get('/:id/export', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const form = await prisma.form.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        responses: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
                children: {
                  select: {
                    name: true,
                    class: { select: { name: true } },
                  },
                },
                studentLinks: {
                  select: {
                    student: {
                      select: {
                        firstName: true,
                        lastName: true,
                        class: { select: { name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!form) {
      return res.status(404).json({ error: 'Form not found' })
    }

    const fields = form.fields as Array<{ id: string; label: string; type: string }>

    // Build CSV header
    const headers = [
      'Parent Name',
      'Parent Email',
      'Children',
      'Classes',
      ...fields.map(f => f.label),
      'Submitted At',
    ]

    // Build CSV rows
    const rows = form.responses.map(response => {
      const answers = response.answers as Record<string, unknown>

      // Get children info (from both old Child model and new StudentLinks)
      const childrenFromOld = response.user.children?.map(c => c.name) || []
      const childrenFromNew = response.user.studentLinks?.map(sl => `${sl.student.firstName} ${sl.student.lastName}`) || []
      const allChildren = [...childrenFromOld, ...childrenFromNew]

      const classesFromOld = response.user.children?.map(c => c.class.name) || []
      const classesFromNew = response.user.studentLinks?.map(sl => sl.student.class.name) || []
      const allClasses = [...new Set([...classesFromOld, ...classesFromNew])]

      const fieldValues = fields.map(f => {
        const val = answers[f.id]
        if (val === undefined || val === null) return ''
        if (f.type === 'checkbox') return val ? 'Yes' : 'No'
        return String(val)
      })

      return [
        response.user.name,
        response.user.email,
        allChildren.join('; '),
        allClasses.join('; '),
        ...fieldValues,
        new Date(response.createdAt).toISOString(),
      ]
    })

    // Convert to CSV
    const escapeCSV = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    }

    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...rows.map(row => row.map(escapeCSV).join(',')),
    ].join('\n')

    // Set headers for CSV download
    const filename = `${form.title.replace(/[^a-zA-Z0-9]/g, '_')}_responses_${new Date().toISOString().split('T')[0]}.csv`
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csvContent)
  } catch (error) {
    console.error('Error exporting form responses:', error)
    res.status(500).json({ error: 'Failed to export responses' })
  }
})

// Close form (admin only)
router.patch('/:id/close', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const existing = await prisma.form.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Form not found' })
    }

    const form = await prisma.form.update({
      where: { id },
      data: { status: 'CLOSED' },
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'FORM', resourceId: form.id, metadata: { title: form.title, status: 'CLOSED' } })

    res.json({ id: form.id, status: form.status })
  } catch (error) {
    console.error('Error closing form:', error)
    res.status(500).json({ error: 'Failed to close form' })
  }
})

// Generate or regenerate export token (admin only)
router.post('/:id/export-token', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const existing = await prisma.form.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Form not found' })
    }

    // Generate a secure random token (32 bytes = 64 hex characters)
    const exportToken = crypto.randomBytes(32).toString('hex')

    const form = await prisma.form.update({
      where: { id },
      data: { exportToken },
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'FORM', resourceId: form.id, metadata: { title: form.title, action: 'generated_export_token' } })

    res.json({
      exportToken: form.exportToken,
      message: 'Export token generated. Anyone with this link can access the form responses.',
    })
  } catch (error) {
    console.error('Error generating export token:', error)
    res.status(500).json({ error: 'Failed to generate export token' })
  }
})

// Delete export token (admin only)
router.delete('/:id/export-token', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const existing = await prisma.form.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Form not found' })
    }

    await prisma.form.update({
      where: { id },
      data: { exportToken: null },
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'FORM', resourceId: id, metadata: { title: existing.title, action: 'deleted_export_token' } })

    res.json({ message: 'Export token deleted. Public link is now disabled.' })
  } catch (error) {
    console.error('Error deleting export token:', error)
    res.status(500).json({ error: 'Failed to delete export token' })
  }
})

// Public CSV export by token (NO AUTH REQUIRED)
// WARNING: This endpoint is publicly accessible to anyone with the token
router.get('/public-export/:token', async (req, res) => {
  try {
    const { token } = req.params

    if (!token || token.length < 32) {
      return res.status(400).json({ error: 'Invalid token' })
    }

    const form = await prisma.form.findUnique({
      where: { exportToken: token },
      include: {
        responses: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
                children: {
                  select: {
                    name: true,
                    class: { select: { name: true } },
                  },
                },
                studentLinks: {
                  select: {
                    student: {
                      select: {
                        firstName: true,
                        lastName: true,
                        class: { select: { name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!form) {
      return res.status(404).json({ error: 'Form not found or link expired' })
    }

    const fields = form.fields as Array<{ id: string; label: string; type: string }>

    // Build CSV header
    const headers = [
      'Parent Name',
      'Parent Email',
      'Children',
      'Classes',
      ...fields.map(f => f.label),
      'Submitted At',
    ]

    // Build CSV rows
    const rows = form.responses.map(response => {
      const answers = response.answers as Record<string, unknown>

      // Get children info (from both old Child model and new StudentLinks)
      const childrenFromOld = response.user.children?.map(c => c.name) || []
      const childrenFromNew = response.user.studentLinks?.map(sl => `${sl.student.firstName} ${sl.student.lastName}`) || []
      const allChildren = [...childrenFromOld, ...childrenFromNew]

      const classesFromOld = response.user.children?.map(c => c.class.name) || []
      const classesFromNew = response.user.studentLinks?.map(sl => sl.student.class.name) || []
      const allClasses = [...new Set([...classesFromOld, ...classesFromNew])]

      const fieldValues = fields.map(f => {
        const val = answers[f.id]
        if (val === undefined || val === null) return ''
        if (f.type === 'checkbox') return val ? 'Yes' : 'No'
        return String(val)
      })

      return [
        response.user.name,
        response.user.email,
        allChildren.join('; '),
        allClasses.join('; '),
        ...fieldValues,
        new Date(response.createdAt).toISOString(),
      ]
    })

    // Convert to CSV
    const escapeCSV = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    }

    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...rows.map(row => row.map(escapeCSV).join(',')),
    ].join('\n')

    // Set headers for CSV - no attachment so Google Sheets can read it directly
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.send(csvContent)
  } catch (error) {
    console.error('Error in public export:', error)
    res.status(500).json({ error: 'Failed to export responses' })
  }
})

// Get export token status (admin only)
router.get('/:id/export-token', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const form = await prisma.form.findFirst({
      where: { id, schoolId: user.schoolId },
      select: { id: true, exportToken: true },
    })

    if (!form) {
      return res.status(404).json({ error: 'Form not found' })
    }

    res.json({
      hasExportToken: !!form.exportToken,
      exportToken: form.exportToken,
    })
  } catch (error) {
    console.error('Error getting export token:', error)
    res.status(500).json({ error: 'Failed to get export token' })
  }
})

export default router
