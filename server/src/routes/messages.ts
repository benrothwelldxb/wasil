import { Router } from 'express'
import { singleAttachment } from '../middleware/attachmentUpload.js'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin, isStaff, canSendToTarget, canMarkUrgent, loadUserWithRelations } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { logAudit, computeChanges } from '../services/audit.js'
import { sendNotification } from '../services/notify.js'
import { signalAdminNotice, unseenNoticeCount } from '../services/adminNotices.js'
import { translateTexts } from '../services/translation.js'
import { uploadFile, generateKey } from '../services/storage.js'
import { checkUpload, ATTACHMENT_MIME_TYPES } from '../services/uploadValidation.js'
import { sanitizeRichText } from '../services/htmlSanitizer.js'

const router = Router()

const createMessageSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  targetClass: z.string().min(1),
  classId: z.string().optional(),
  yearGroupId: z.string().optional(),
  groupId: z.string().optional(),
  actionType: z.string().optional(),
  actionLabel: z.string().optional(),
  actionDueDate: z.string().optional(),
  actionAmount: z.string().optional(),
  isPinned: z.boolean().optional(),
  isUrgent: z.boolean().optional(),
  requiresAcknowledgment: z.boolean().optional(),
  scheduledAt: z.string().optional(),
  expiresAt: z.string().optional(),
  formId: z.string().optional(),
  channel: z.enum(['FEED', 'ADMIN_NOTICE']).optional(),
  department: z.string().max(60).optional(),
  attachments: z.array(z.object({
    fileName: z.string(),
    fileUrl: z.string(),
    fileType: z.string(),
    fileSize: z.number(),
  })).optional(),
})

const updateMessageSchema = createMessageSchema.partial()


// Upload attachment file to R2 (staff/admin only)
router.post('/upload', isStaff, singleAttachment(), async (req, res) => {
  try {
    const uploaded = req.file
    if (!uploaded) {
      return res.status(400).json({ error: 'File is required' })
    }

    const check = checkUpload(uploaded.buffer, uploaded.mimetype, uploaded.originalname, ATTACHMENT_MIME_TYPES)
    if (!check.valid) {
      return res.status(400).json({ error: `File rejected: ${check.reason}. Supported: images, PDF, Word documents.` })
    }

    const key = generateKey('message-attachments', uploaded.originalname)
    const fileUrl = await uploadFile(uploaded.buffer, key, uploaded.mimetype)

    res.json({
      fileName: uploaded.originalname,
      fileUrl,
      fileType: uploaded.mimetype,
      fileSize: uploaded.size,
    })
  } catch (error) {
    console.error('Error uploading attachment:', error)
    res.status(500).json({ error: 'Failed to upload attachment' })
  }
})

/**
 * How long a post stays on the dashboard.
 *
 * The dashboard is a parent's home screen and was showing the entire archive —
 * every post the school had ever written, oldest at the bottom, all of it
 * downloaded on every load. A school a term in was asking parents to scroll
 * past a book fair from September to find today's.
 *
 * Applied at READ time, not by archiving rows: nothing is deleted, a post from
 * March is still there on the Posts page, and a window that turns out to be
 * wrong can be changed without having undone anything. It also means the
 * existing backlog clears the moment this ships, with no migration.
 *
 * Thirty days is about a half-term. Deliberately not a per-school setting yet —
 * one more thing to configure, and nobody knows the right number until a term
 * of real use.
 */
const DASHBOARD_WINDOW_DAYS = 30

/** A backstop, so a school that posts constantly still gets a finite dashboard.
 *  Ordered pinned → urgent → newest, so a cap keeps what matters most. */
const DASHBOARD_MAX = 50

/** Which classes, year groups and groups a parent's children belong to. */
async function resolveParentAudience(user: {
  children?: { classId: string }[] | null
  studentLinks?: { studentId: string; student: { classId?: string | null } }[] | null
}) {
  // Class IDs must union BOTH the legacy children[] relation AND the Hub
  // studentLinks — Hub-provisioned parents link children only via studentLinks
  // and have zero legacy children, so children-only derivation left them with
  // no class-targeted content. Deduped so legacy-children parents are unaffected.
  const childClassIds = [...new Set([
    ...(user.children?.map(c => c.classId) || []),
    ...(user.studentLinks?.map(l => l.student.classId).filter((id): id is string => !!id) || []),
  ])]
  const studentIds = user.studentLinks?.map(l => l.studentId) || []

  const childClasses = childClassIds.length > 0
    ? await prisma.class.findMany({ where: { id: { in: childClassIds } }, select: { yearGroupId: true } })
    : []
  const childYearGroupIds = [...new Set(childClasses.map(c => c.yearGroupId).filter(Boolean))] as string[]

  const childGroupLinks = studentIds.length > 0
    ? await prisma.studentGroupLink.findMany({ where: { studentId: { in: studentIds } }, select: { groupId: true } })
    : []
  const childGroupIds = [...new Set(childGroupLinks.map(l => l.groupId))]

  return { childClassIds, childYearGroupIds, childGroupIds }
}

function audienceOR(a: { childClassIds: string[]; childYearGroupIds: string[]; childGroupIds: string[] }) {
  return [
    { targetClass: 'Whole School' },
    { classId: { in: a.childClassIds } },
    ...(a.childYearGroupIds.length > 0 ? [{ yearGroupId: { in: a.childYearGroupIds } }] : []),
    ...(a.childGroupIds.length > 0 ? [{ groupId: { in: a.childGroupIds } }] : []),
  ]
}

/** Live for a parent right now: not expired, not still scheduled. */
function liveForParent(now: Date) {
  return [
    { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    { OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
  ]
}

function messageInclude(userId: string) {
  return {
    sender: { select: { id: true, name: true } },
    acknowledgments: { where: { userId } },
    _count: { select: { acknowledgments: true } },
    form: { include: { responses: { where: { userId } } } },
    attachments: true,
  } as const
}

/** Titles, bodies and form text in the parent's language, when it isn't English. */
async function buildTranslator(
  messages: Array<{ title: string; content: string; form?: { title: string; description: string | null } | null }>,
  targetLang: string,
) {
  const map = new Map<string, string>()
  if (targetLang !== 'en' && messages.length > 0) {
    const texts: string[] = []
    messages.forEach(msg => {
      texts.push(msg.title, msg.content)
      if (msg.form?.title) texts.push(msg.form.title)
      if (msg.form?.description) texts.push(msg.form.description)
    })
    const translations = await translateTexts(texts, targetLang)
    let i = 0
    messages.forEach(msg => {
      map.set(msg.title, translations[i++])
      map.set(msg.content, translations[i++])
      if (msg.form?.title) map.set(msg.form.title, translations[i++])
      if (msg.form?.description) map.set(msg.form.description, translations[i++])
    })
  }
  return (text: string) => map.get(text) || text
}

/** One post as a parent reads it. Shared so the dashboard and the Posts page
 *  cannot drift into rendering the same post differently. */
function serializeParentMessage(msg: any, getTranslated: (t: string) => string) {
  return {
      id: msg.id,
      title: getTranslated(msg.title),
      content: getTranslated(msg.content),
      targetClass: msg.targetClass,
      classId: msg.classId,
      yearGroupId: msg.yearGroupId,
      groupId: msg.groupId,
      schoolId: msg.schoolId,
      senderId: msg.senderId,
      senderName: msg.sender.name,
      actionType: msg.actionType,
      actionLabel: msg.actionLabel,
      actionDueDate: msg.actionDueDate?.toISOString(),
      actionAmount: msg.actionAmount,
      isPinned: msg.isPinned,
      isUrgent: msg.isUrgent,
      requiresAcknowledgment: msg.requiresAcknowledgment,
      expiresAt: msg.expiresAt?.toISOString(),
      formId: msg.formId,
      form: msg.form ? {
        id: msg.form.id,
        title: getTranslated(msg.form.title),
        description: msg.form.description ? getTranslated(msg.form.description) : null,
        type: msg.form.type,
        status: msg.form.status,
        fields: msg.form.fields,
        targetClass: msg.form.targetClass,
        classIds: msg.form.classIds as string[],
        yearGroupIds: msg.form.yearGroupIds as string[],
        schoolId: msg.form.schoolId,
        expiresAt: msg.form.expiresAt?.toISOString() || null,
        createdAt: msg.form.createdAt.toISOString(),
        updatedAt: msg.form.updatedAt.toISOString(),
        userResponse: msg.form.responses[0] ? {
          id: msg.form.responses[0].id,
          formId: msg.form.responses[0].formId,
          userId: msg.form.responses[0].userId,
          answers: msg.form.responses[0].answers,
          createdAt: msg.form.responses[0].createdAt.toISOString(),
        } : null,
      } : undefined,
      attachments: msg.attachments.map((a: {
        id: string; messageId: string; fileName: string; fileUrl: string; fileType: string; fileSize: number; createdAt: Date
      }) => ({
        id: a.id,
        messageId: a.messageId,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileType: a.fileType,
        fileSize: a.fileSize,
        createdAt: a.createdAt.toISOString(),
      })),
      acknowledged: msg.acknowledgments.length > 0,
      acknowledgmentCount: msg._count.acknowledgments,
      createdAt: msg.createdAt.toISOString(),
  }
}

// The dashboard feed: what is CURRENT. Older posts live on the Posts page.
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!
    const now = new Date()
    const audience = await resolveParentAudience(user)
    const windowStart = new Date(now.getTime() - DASHBOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    const messages = await prisma.message.findMany({
      where: {
        schoolId: user.schoolId,
        // Admin Notices live in their own section. A fee reminder and a
        // medication note are not news and should not compete with it.
        channel: 'FEED',
        OR: audienceOR(audience),
        AND: [
          ...liveForParent(now),
          {
            OR: [
              { createdAt: { gte: windowStart } },
              // A pinned post is the school saying "this one stays".
              { isPinned: true },
              // And the safety catch: a post still ASKING something of this
              // parent does not age out. Hiding an unsigned consent form
              // because it is five weeks old would be the tidy-up doing real
              // harm — the clutter is worth less than the form.
              { AND: [{ requiresAcknowledgment: true }, { acknowledgments: { none: { userId: user.id } } }] },
            ],
          },
        ],
      },
      include: messageInclude(user.id),
      orderBy: [{ isPinned: 'desc' }, { isUrgent: 'desc' }, { createdAt: 'desc' }],
      take: DASHBOARD_MAX,
    })

    const getTranslated = await buildTranslator(messages, user.preferredLanguage || 'en')
    res.json(messages.map(msg => serializeParentMessage(msg, getTranslated)))
  } catch (error) {
    console.error('Error fetching messages:', error)
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

/**
 * Everything the parent may see, oldest included — the Posts page.
 *
 * Cursor-paginated rather than a bare limit: a school posts daily and an offset
 * would skip or repeat a post whenever a new one landed mid-scroll.
 *
 * Expired posts stay out. `expiresAt` is the school saying "stop showing this",
 * and honouring that in one place and not the other would make the rule mean
 * two things.
 */
router.get('/archive', isAuthenticated, async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!
    const now = new Date()
    const audience = await resolveParentAudience(user)

    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 50)
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor.trim() ? req.query.cursor.trim() : null

    const messages = await prisma.message.findMany({
      where: {
        schoolId: user.schoolId,
        channel: 'FEED',
        OR: audienceOR(audience),
        AND: liveForParent(now),
      },
      include: messageInclude(user.id),
      // Strictly by date here, not pinned-first: this is a record of what was
      // said and when, and reordering it by importance would make the months
      // read wrongly.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    // One extra was fetched purely to answer "is there more", and is not sent.
    const hasMore = messages.length > limit
    const page = hasMore ? messages.slice(0, limit) : messages

    const getTranslated = await buildTranslator(page, user.preferredLanguage || 'en')
    res.json({
      messages: page.map(msg => serializeParentMessage(msg, getTranslated)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    })
  } catch (error) {
    console.error('Error fetching message archive:', error)
    res.status(500).json({ error: 'Failed to fetch posts' })
  }
})

// Get all messages (admin)
// ─── Admin Notices (parent-facing) ───────────────────────────────────────────
// The section notices live in, kept out of GET / on purpose. Same audience
// rules as the feed — a notice is targeted exactly like a post.
router.get('/notices', isAuthenticated, async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!
    const childClassIds = [...new Set([
      ...(user.children?.map(c => c.classId) || []),
      ...(user.studentLinks?.map(l => l.student.classId).filter((id): id is string => !!id) || []),
    ])]
    const studentIds = user.studentLinks?.map(l => l.studentId) || []
    const now = new Date()

    const childClasses = childClassIds.length > 0
      ? await prisma.class.findMany({ where: { id: { in: childClassIds } }, select: { yearGroupId: true } })
      : []
    const childYearGroupIds = [...new Set(childClasses.map(c => c.yearGroupId).filter(Boolean))] as string[]

    const childGroupLinks = studentIds.length > 0
      ? await prisma.studentGroupLink.findMany({ where: { studentId: { in: studentIds } }, select: { groupId: true } })
      : []
    const childGroupIds = [...new Set(childGroupLinks.map(l => l.groupId))]

    const notices = await prisma.message.findMany({
      where: {
        schoolId: user.schoolId,
        channel: 'ADMIN_NOTICE',
        OR: [
          { targetClass: 'Whole School' },
          { classId: { in: childClassIds } },
          ...(childYearGroupIds.length > 0 ? [{ yearGroupId: { in: childYearGroupIds } }] : []),
          ...(childGroupIds.length > 0 ? [{ groupId: { in: childGroupIds } }] : []),
        ],
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
        ],
      },
      include: { attachments: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const lastSeenAt = user.noticesLastSeenAt ?? null
    res.json({
      lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
      notices: notices.map(n => ({
        id: n.id,
        title: n.title,
        content: n.content,
        // What a parent sees in place of the sender's name.
        department: n.department,
        isUrgent: n.isUrgent,
        createdAt: n.createdAt.toISOString(),
        // Newer than the last visit — the bar counted these.
        isNew: !lastSeenAt || n.createdAt > lastSeenAt,
        attachments: n.attachments.map(a => ({
          id: a.id, fileName: a.fileName, fileUrl: a.fileUrl, fileType: a.fileType, fileSize: a.fileSize,
        })),
      })),
    })
  } catch (error) {
    console.error('Error fetching admin notices:', error)
    // Never degrade to an empty list: "no notices" and "we could not load your
    // notices" must not look the same when one of them is from the clinic.
    res.status(500).json({ error: 'Failed to fetch notices' })
  }
})

// How many notices this parent has not seen — drives the homepage bar.
router.get('/notices/unseen-count', isAuthenticated, async (req, res) => {
  try {
    res.json({ count: await unseenNoticeCount(req.user!.id) })
  } catch (error) {
    console.error('Error counting unseen notices:', error)
    res.status(500).json({ error: 'Failed to count notices' })
  }
})

// Stamped when the parent opens the section, which is what clears the bar.
router.post('/notices/seen', isAuthenticated, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { noticesLastSeenAt: new Date() },
    })
    res.json({ message: 'Marked as seen' })
  } catch (error) {
    console.error('Error marking notices seen:', error)
    res.status(500).json({ error: 'Failed to mark as seen' })
  }
})

router.get('/all', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const messages = await prisma.message.findMany({
      where: { schoolId: user.schoolId },
      include: {
        sender: { select: { id: true, name: true } },
        _count: { select: { acknowledgments: true } },
        form: {
          include: {
            _count: { select: { responses: true } },
          },
        },
        attachments: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const now = new Date()
    res.json(messages.map(msg => ({
      id: msg.id,
      title: msg.title,
      content: msg.content,
      targetClass: msg.targetClass,
      classId: msg.classId,
      yearGroupId: msg.yearGroupId,
      groupId: msg.groupId,
      schoolId: msg.schoolId,
      senderId: msg.senderId,
      senderName: msg.sender.name,
      actionType: msg.actionType,
      actionLabel: msg.actionLabel,
      actionDueDate: msg.actionDueDate?.toISOString(),
      actionAmount: msg.actionAmount,
      isPinned: msg.isPinned,
      isUrgent: msg.isUrgent,
      requiresAcknowledgment: msg.requiresAcknowledgment,
      scheduledAt: msg.scheduledAt?.toISOString(),
      isScheduled: msg.scheduledAt ? msg.scheduledAt > now : false,
      expiresAt: msg.expiresAt?.toISOString(),
      isExpired: msg.expiresAt ? msg.expiresAt < now : false,
      formId: msg.formId,
      form: msg.form ? {
        id: msg.form.id,
        title: msg.form.title,
        type: msg.form.type,
        status: msg.form.status,
        fields: msg.form.fields,
        responseCount: msg.form._count.responses,
      } : undefined,
      attachments: msg.attachments.map(a => ({
        id: a.id,
        messageId: a.messageId,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileType: a.fileType,
        fileSize: a.fileSize,
        createdAt: a.createdAt.toISOString(),
      })),
      acknowledgmentCount: msg._count.acknowledgments,
      createdAt: msg.createdAt.toISOString(),
      updatedAt: msg.updatedAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching all messages:', error)
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

// Create message (staff can send to assigned classes, admin can send anywhere)
router.post('/', isStaff, validate(createMessageSchema), canSendToTarget, canMarkUrgent, async (req, res) => {
  try {
    const user = req.user!
    const { title, content, targetClass, classId, yearGroupId, groupId, actionType, actionLabel, actionDueDate, actionAmount, isPinned, isUrgent, requiresAcknowledgment, scheduledAt, expiresAt, formId, attachments, channel, department } = req.body
    const isNotice = channel === 'ADMIN_NOTICE'

    // Staff cannot pin messages (only admin)
    const canPin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

    // A future-dated post is hidden from parents until its time (the list route
    // filters on scheduledAt), so announcing it at creation pushed an alert
    // about something they could not then find.
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null
    const liveNow = !scheduledDate || scheduledDate <= new Date()

    const message = await prisma.message.create({
      data: {
        title,
        content: sanitizeRichText(content),
        targetClass,
        classId: classId || null,
        yearGroupId: yearGroupId || null,
        groupId: groupId || null,
        schoolId: user.schoolId,
        senderId: user.id,
        senderName: user.name,
        actionType: actionType || null,
        actionLabel: actionLabel || null,
        actionDueDate: actionDueDate ? new Date(actionDueDate) : null,
        actionAmount: actionAmount || null,
        isPinned: canPin ? (isPinned || false) : false,
        isUrgent: isUrgent || false,
        requiresAcknowledgment: requiresAcknowledgment || false,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        // Stamped now for a live post; left null for a future-dated one so the
        // publishScheduledMessages sweep knows it still owes an announcement.
        notifiedAt: liveNow ? new Date() : null,
        channel: isNotice ? 'ADMIN_NOTICE' : 'FEED',
        department: isNotice && typeof department === 'string' && department.trim() ? department.trim() : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        formId: formId || null,
      },
    })

    // Auto-activate attached form
    if (formId) {
      // Scope by school so a message can't flip another school's form ACTIVE.
      await prisma.form.updateMany({
        where: { id: formId, schoolId: user.schoolId },
        data: { status: 'ACTIVE' },
      })
    }

    // Create attachment records
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      await prisma.messageAttachment.createMany({
        data: attachments.map((a: { fileName: string; fileUrl: string; fileType: string; fileSize: number }) => ({
          messageId: message.id,
          fileName: a.fileName,
          fileUrl: a.fileUrl,
          fileType: a.fileType,
          fileSize: a.fileSize,
        })),
      })
    }

    // Fetch created attachments for response
    const createdAttachments = await prisma.messageAttachment.findMany({
      where: { messageId: message.id },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'MESSAGE', resourceId: message.id, metadata: { title: message.title, attachmentCount: createdAttachments.length } })

    const target = { targetClass, classId: classId || undefined, yearGroupId: yearGroupId || undefined, groupId: groupId || undefined, schoolId: user.schoolId }

    if (liveNow) {
      if (isNotice) {
        // A notice is quiet in the app by design — it does not push unless the
        // sender escalated it (a whole-school health message, say). What it
        // always does is email, so the section is discoverable without the
        // content ever leaving the app.
        signalAdminNotice({ schoolId: user.schoolId, department: message.department, target })
          .catch(err => console.error('Admin notice signal failed:', err))
        if (isUrgent) {
          sendNotification({ req, type: 'MESSAGE', title: message.department || 'Admin notice', body: message.title, resourceType: 'MESSAGE', resourceId: message.id, target })
        }
      } else {
        sendNotification({ req, type: 'MESSAGE', title: message.title, body: message.content.substring(0, 200), resourceType: 'MESSAGE', resourceId: message.id, target })
      }
    }

    res.status(201).json({
      id: message.id,
      title: message.title,
      content: message.content,
      targetClass: message.targetClass,
      classId: message.classId,
      yearGroupId: message.yearGroupId,
      groupId: message.groupId,
      schoolId: message.schoolId,
      senderId: message.senderId,
      senderName: message.senderName,
      actionType: message.actionType,
      actionLabel: message.actionLabel,
      actionDueDate: message.actionDueDate?.toISOString(),
      actionAmount: message.actionAmount,
      isPinned: message.isPinned,
      isUrgent: message.isUrgent,
      requiresAcknowledgment: message.requiresAcknowledgment,
      scheduledAt: message.scheduledAt?.toISOString(),
      expiresAt: message.expiresAt?.toISOString(),
      formId: message.formId,
      attachments: createdAttachments.map(a => ({
        id: a.id,
        messageId: a.messageId,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileType: a.fileType,
        fileSize: a.fileSize,
        createdAt: a.createdAt.toISOString(),
      })),
      createdAt: message.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating message:', error)
    res.status(500).json({ error: 'Failed to create message' })
  }
})

// Update message (admin only)
router.put('/:id', isAdmin, validate(updateMessageSchema), async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { title, content, targetClass, classId, yearGroupId, groupId, actionType, actionLabel, actionDueDate, actionAmount, isPinned, isUrgent, requiresAcknowledgment, scheduledAt, expiresAt, formId, attachments } = req.body

    // Verify message belongs to user's school
    const existing = await prisma.message.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Message not found' })
    }

    const message = await prisma.message.update({
      where: { id },
      data: {
        title,
        content: sanitizeRichText(content),
        targetClass,
        classId: classId || null,
        yearGroupId: yearGroupId || null,
        groupId: groupId !== undefined ? (groupId || null) : existing.groupId,
        actionType: actionType || null,
        actionLabel: actionLabel || null,
        actionDueDate: actionDueDate ? new Date(actionDueDate) : null,
        actionAmount: actionAmount || null,
        isPinned: isPinned ?? existing.isPinned,
        isUrgent: isUrgent ?? existing.isUrgent,
        requiresAcknowledgment: requiresAcknowledgment ?? existing.requiresAcknowledgment,
        scheduledAt: scheduledAt !== undefined ? (scheduledAt ? new Date(scheduledAt) : null) : existing.scheduledAt,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        formId: formId !== undefined ? (formId || null) : existing.formId,
      },
    })

    // Auto-activate newly attached form
    if (formId && formId !== existing.formId) {
      await prisma.form.updateMany({
        where: { id: formId, schoolId: user.schoolId },
        data: { status: 'ACTIVE' },
      })
    }

    // Sync attachments if provided (replace all)
    if (attachments !== undefined && Array.isArray(attachments)) {
      await prisma.messageAttachment.deleteMany({ where: { messageId: id } })
      if (attachments.length > 0) {
        await prisma.messageAttachment.createMany({
          data: attachments.map((a: { fileName: string; fileUrl: string; fileType: string; fileSize: number }) => ({
            messageId: id,
            fileName: a.fileName,
            fileUrl: a.fileUrl,
            fileType: a.fileType,
            fileSize: a.fileSize,
          })),
        })
      }
    }

    const updatedAttachments = await prisma.messageAttachment.findMany({
      where: { messageId: id },
    })

    const changes = computeChanges(existing as any, message as any, ['title', 'content', 'targetClass', 'isPinned', 'isUrgent', 'requiresAcknowledgment', 'actionType', 'actionLabel', 'actionDueDate', 'actionAmount'])
    logAudit({ req, action: 'UPDATE', resourceType: 'MESSAGE', resourceId: message.id, metadata: { title: message.title }, changes })

    res.json({
      id: message.id,
      title: message.title,
      content: message.content,
      targetClass: message.targetClass,
      classId: message.classId,
      yearGroupId: message.yearGroupId,
      groupId: message.groupId,
      schoolId: message.schoolId,
      senderId: message.senderId,
      senderName: message.senderName,
      actionType: message.actionType,
      actionLabel: message.actionLabel,
      actionDueDate: message.actionDueDate?.toISOString(),
      actionAmount: message.actionAmount,
      isPinned: message.isPinned,
      isUrgent: message.isUrgent,
      requiresAcknowledgment: message.requiresAcknowledgment,
      expiresAt: message.expiresAt?.toISOString(),
      formId: message.formId,
      attachments: updatedAttachments.map(a => ({
        id: a.id,
        messageId: a.messageId,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileType: a.fileType,
        fileSize: a.fileSize,
        createdAt: a.createdAt.toISOString(),
      })),
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating message:', error)
    res.status(500).json({ error: 'Failed to update message' })
  }
})

// Delete message (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    // Verify message belongs to user's school
    const existing = await prisma.message.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Message not found' })
    }

    await prisma.message.delete({
      where: { id },
    })

    logAudit({ req, action: 'DELETE', resourceType: 'MESSAGE', resourceId: id, metadata: { title: existing.title } })

    res.json({ message: 'Message deleted successfully' })
  } catch (error) {
    console.error('Error deleting message:', error)
    res.status(500).json({ error: 'Failed to delete message' })
  }
})

// Acknowledge message
router.post('/:id/ack', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const acknowledgment = await prisma.messageAcknowledgment.upsert({
      where: {
        messageId_userId: {
          messageId: id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        messageId: id,
        userId: user.id,
      },
    })

    res.json({
      id: acknowledgment.id,
      messageId: acknowledgment.messageId,
      userId: acknowledgment.userId,
      createdAt: acknowledgment.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error acknowledging message:', error)
    res.status(500).json({ error: 'Failed to acknowledge message' })
  }
})

export default router
