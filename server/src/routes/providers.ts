import { Router } from 'express'
import crypto from 'crypto'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { isAdmin } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { logAudit } from '../services/audit.js'

const router = Router()

const INVITE_EXPIRY_DAYS = 7

const createProviderSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['ECA', 'CATERING']),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
})
const updateProviderSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  shareParentContact: z.boolean().optional(),
})
const inviteSchema = z.object({ email: z.string().email() })

/**
 * Confirm the provider is linked to the requesting admin's school. Every route
 * uses this so an admin can only ever see/manage providers at their own school.
 */
async function getLinkedProvider(providerId: string, schoolId: string) {
  const link = await prisma.providerSchoolLink.findUnique({
    where: { providerId_schoolId: { providerId, schoolId } },
    include: { provider: true },
  })
  return link
}

// ─── Create a provider and link it to this school ────────────────────────────
router.post('/', isAdmin, validate(createProviderSchema), async (req, res) => {
  try {
    const { name, type, contactEmail, contactPhone } = req.body
    const schoolId = req.user!.schoolId

    const provider = await prisma.$transaction(async tx => {
      const created = await tx.provider.create({
        data: { name, type, contactEmail: contactEmail || null, contactPhone: contactPhone || null },
      })
      await tx.providerSchoolLink.create({ data: { providerId: created.id, schoolId } })
      return created
    })

    logAudit({ req, action: 'CREATE', resourceType: 'PROVIDER' as never, resourceId: provider.id, metadata: { name, type } })
    res.status(201).json(provider)
  } catch (error) {
    console.error('Error creating provider:', error)
    res.status(500).json({ error: 'Failed to create provider' })
  }
})

// ─── List providers linked to this school ────────────────────────────────────
router.get('/', isAdmin, async (req, res) => {
  try {
    const links = await prisma.providerSchoolLink.findMany({
      where: { schoolId: req.user!.schoolId },
      include: { provider: { include: { _count: { select: { users: true, ecaActivities: true } } } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(links.map(l => ({
      id: l.provider.id,
      name: l.provider.name,
      type: l.provider.type,
      status: l.provider.status,
      logoUrl: l.provider.logoUrl,
      contactEmail: l.provider.contactEmail,
      contactPhone: l.provider.contactPhone,
      shareParentContact: l.shareParentContact,
      userCount: l.provider._count.users,
      activityCount: l.provider._count.ecaActivities,
      createdAt: l.provider.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error listing providers:', error)
    res.status(500).json({ error: 'Failed to list providers' })
  }
})

// ─── Get one provider (+ its portal users) ───────────────────────────────────
router.get('/:id', isAdmin, async (req, res) => {
  try {
    const link = await getLinkedProvider(req.params.id, req.user!.schoolId)
    if (!link) return res.status(404).json({ error: 'Provider not found' })

    const users = await prisma.providerUser.findMany({
      where: { providerId: link.providerId },
      select: { id: true, email: true, name: true, lastLoginAt: true, passwordHash: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    const pendingInvites = await prisma.providerInvitation.findMany({
      where: { providerId: link.providerId, status: 'PENDING' },
      select: { id: true, email: true, expiresAt: true, createdAt: true },
    })

    res.json({
      id: link.provider.id,
      name: link.provider.name,
      type: link.provider.type,
      status: link.provider.status,
      logoUrl: link.provider.logoUrl,
      contactEmail: link.provider.contactEmail,
      contactPhone: link.provider.contactPhone,
      shareParentContact: link.shareParentContact,
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        hasPassword: !!u.passwordHash,
        lastLoginAt: u.lastLoginAt?.toISOString() || null,
      })),
      pendingInvites: pendingInvites.map(i => ({ id: i.id, email: i.email, expiresAt: i.expiresAt?.toISOString() || null })),
    })
  } catch (error) {
    console.error('Error fetching provider:', error)
    res.status(500).json({ error: 'Failed to fetch provider' })
  }
})

// ─── Update provider (status / details / contact-sharing) ────────────────────
router.patch('/:id', isAdmin, validate(updateProviderSchema), async (req, res) => {
  try {
    const link = await getLinkedProvider(req.params.id, req.user!.schoolId)
    if (!link) return res.status(404).json({ error: 'Provider not found' })

    const { name, status, contactEmail, contactPhone, shareParentContact } = req.body

    if (name !== undefined || status !== undefined || contactEmail !== undefined || contactPhone !== undefined) {
      await prisma.provider.update({
        where: { id: link.providerId },
        data: {
          ...(name !== undefined && { name }),
          ...(status !== undefined && { status }),
          ...(contactEmail !== undefined && { contactEmail }),
          ...(contactPhone !== undefined && { contactPhone }),
        },
      })
    }
    // The parent-contact-sharing toggle lives on the per-school link.
    if (shareParentContact !== undefined) {
      await prisma.providerSchoolLink.update({
        where: { providerId_schoolId: { providerId: link.providerId, schoolId: req.user!.schoolId } },
        data: { shareParentContact },
      })
    }

    logAudit({ req, action: 'UPDATE', resourceType: 'PROVIDER' as never, resourceId: link.providerId, metadata: { status, shareParentContact } })
    res.json({ message: 'Provider updated' })
  } catch (error) {
    console.error('Error updating provider:', error)
    res.status(500).json({ error: 'Failed to update provider' })
  }
})

// ─── Invite a provider portal user ───────────────────────────────────────────
router.post('/:id/invitations', isAdmin, validate(inviteSchema), async (req, res) => {
  try {
    const link = await getLinkedProvider(req.params.id, req.user!.schoolId)
    if (!link) return res.status(404).json({ error: 'Provider not found' })

    const email = req.body.email.toLowerCase()
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    // Clear any prior pending invite for this email so only one is live.
    await prisma.providerInvitation.deleteMany({
      where: { providerId: link.providerId, email, status: 'PENDING' },
    })
    const invitation = await prisma.providerInvitation.create({
      data: { providerId: link.providerId, email, token, expiresAt },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'PROVIDER_INVITATION' as never, resourceId: invitation.id, metadata: { providerId: link.providerId, email } })
    // Email delivery of the link is wired in a later phase; return the token so
    // the admin UI can surface/copy the invite link now.
    res.status(201).json({ id: invitation.id, email, token, expiresAt: expiresAt.toISOString() })
  } catch (error) {
    console.error('Error inviting provider user:', error)
    res.status(500).json({ error: 'Failed to create invitation' })
  }
})

export default router
