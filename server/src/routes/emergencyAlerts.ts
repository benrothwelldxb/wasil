import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'
import { sendNotification } from '../services/notify.js'
import { sendSMS, sendWhatsApp } from '../services/twilio.js'
import { sendEmail } from '../services/email.js'

const router = Router()

// ─── Parent endpoint: Get active + recently resolved critical alerts ───
const RESOLVED_DISPLAY_HOURS = 4
const CRITICAL_ALERT_TYPES: Array<'LOCKDOWN' | 'SECURITY'> = ['LOCKDOWN', 'SECURITY']

router.get('/active', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const resolvedCutoff = new Date(Date.now() - RESOLVED_DISPLAY_HOURS * 60 * 60 * 1000)

    const alerts = await prisma.emergencyAlert.findMany({
      where: {
        schoolId: user.schoolId,
        OR: [
          // All currently active alerts
          { status: 'ACTIVE' },
          // Recently resolved LOCKDOWN/SECURITY (visible for 4 hours after resolution)
          {
            status: 'RESOLVED',
            type: { in: CRITICAL_ALERT_TYPES },
            resolvedAt: { gte: resolvedCutoff },
          },
        ],
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { sentAt: 'desc' },
    })

    // Check acknowledgment status for current user
    const ackRecords = alerts.length > 0
      ? await Promise.all(alerts.map(a =>
          prisma.alertAcknowledgment.findFirst({
            where: { alertId: a.id, parentId: user.id },
          })
        ))
      : []

    res.json(alerts.map((a, i) => ({
      id: a.id,
      title: a.title,
      message: a.message,
      type: a.type,
      severity: a.severity,
      status: a.status,
      targetClass: a.targetClass,
      requireAck: a.requireAck,
      isDrill: a.isDrill,
      drillName: a.drillName,
      sentAt: a.sentAt.toISOString(),
      resolvedAt: a.resolvedAt?.toISOString() || null,
      createdBy: a.createdBy.name,
      acknowledged: !!ackRecords[i],
      acknowledgedAt: ackRecords[i]?.acknowledgedAt?.toISOString() || null,
      createdAt: a.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching active alerts:', error)
    res.status(500).json({ error: 'Failed to fetch active alerts' })
  }
})

// ─── Admin: List all alerts ───
router.get('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const alerts = await prisma.emergencyAlert.findMany({
      where: { schoolId: user.schoolId },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { deliveries: true, acknowledgments: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Get delivery stats per alert
    const alertIds = alerts.map(a => a.id)
    const deliveryStats = alertIds.length > 0
      ? await prisma.alertDelivery.groupBy({
          by: ['alertId', 'channel', 'status'],
          where: { alertId: { in: alertIds } },
          _count: true,
        })
      : []

    // Build stats map
    const statsMap: Record<string, Record<string, { sent: number; delivered: number; failed: number; pending: number }>> = {}
    for (const stat of deliveryStats) {
      if (!statsMap[stat.alertId]) statsMap[stat.alertId] = {}
      if (!statsMap[stat.alertId][stat.channel]) {
        statsMap[stat.alertId][stat.channel] = { sent: 0, delivered: 0, failed: 0, pending: 0 }
      }
      const key = stat.status.toLowerCase() as 'sent' | 'delivered' | 'failed' | 'pending'
      statsMap[stat.alertId][stat.channel][key] = stat._count
    }

    res.json(alerts.map(a => ({
      id: a.id,
      title: a.title,
      message: a.message,
      type: a.type,
      severity: a.severity,
      status: a.status,
      sendPush: a.sendPush,
      sendSms: a.sendSms,
      sendWhatsapp: a.sendWhatsapp,
      sendEmail: a.sendEmail,
      targetClass: a.targetClass,
      isDrill: a.isDrill,
      drillName: a.drillName,
      requireAck: a.requireAck,
      sentAt: a.sentAt.toISOString(),
      resolvedAt: a.resolvedAt?.toISOString() || null,
      resolvedBy: a.resolvedBy,
      createdBy: a.createdBy.name,
      totalDeliveries: a._count.deliveries,
      ackCount: a._count.acknowledgments,
      deliveryStats: statsMap[a.id] || {},
      createdAt: a.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching alerts:', error)
    res.status(500).json({ error: 'Failed to fetch alerts' })
  }
})

// ─── Admin: Get alert detail with delivery stats ───
router.get('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const alert = await prisma.emergencyAlert.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { acknowledgments: true } },
      },
    })

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' })
    }

    const deliveryStats = await prisma.alertDelivery.groupBy({
      by: ['channel', 'status'],
      where: { alertId: id },
      _count: true,
    })

    const channelStats: Record<string, { sent: number; delivered: number; failed: number; pending: number }> = {}
    for (const stat of deliveryStats) {
      if (!channelStats[stat.channel]) {
        channelStats[stat.channel] = { sent: 0, delivered: 0, failed: 0, pending: 0 }
      }
      const key = stat.status.toLowerCase() as 'sent' | 'delivered' | 'failed' | 'pending'
      channelStats[stat.channel][key] = stat._count
    }

    res.json({
      id: alert.id,
      title: alert.title,
      message: alert.message,
      type: alert.type,
      severity: alert.severity,
      status: alert.status,
      sendPush: alert.sendPush,
      sendSms: alert.sendSms,
      sendWhatsapp: alert.sendWhatsapp,
      sendEmail: alert.sendEmail,
      targetClass: alert.targetClass,
      isDrill: alert.isDrill,
      drillName: alert.drillName,
      requireAck: alert.requireAck,
      ackCount: alert._count.acknowledgments,
      sentAt: alert.sentAt.toISOString(),
      resolvedAt: alert.resolvedAt?.toISOString() || null,
      resolvedBy: alert.resolvedBy,
      createdBy: alert.createdBy.name,
      deliveryStats: channelStats,
      createdAt: alert.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching alert:', error)
    res.status(500).json({ error: 'Failed to fetch alert' })
  }
})

// ─── Admin: Create and send emergency alert ───
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { title, message, type, severity, targetClass, sendPush, sendSms, sendWhatsapp, sendEmail: doSendEmail, isDrill, drillName, requireAck } = req.body

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' })
    }

    // Create the alert
    const alert = await prisma.emergencyAlert.create({
      data: {
        schoolId: user.schoolId,
        title,
        message,
        type: type || 'GENERAL',
        severity: severity || 'HIGH',
        sendPush: sendPush !== false,
        sendSms: sendSms || false,
        sendWhatsapp: sendWhatsapp || false,
        sendEmail: doSendEmail || false,
        targetClass: targetClass || null,
        isDrill: isDrill || false,
        drillName: drillName || null,
        requireAck: requireAck || false,
        createdById: user.id,
      },
    })

    // Find target parents
    let parentUsers: Array<{ id: string; email: string; name: string; phone: string | null }> = []

    if (!targetClass || targetClass === 'Whole School') {
      parentUsers = await prisma.user.findMany({
        where: { schoolId: user.schoolId, role: 'PARENT' },
        select: { id: true, email: true, name: true, phone: true },
      })
    } else {
      // Find parents with children in the specified class
      const targetClassRecord = await prisma.class.findFirst({
        where: { schoolId: user.schoolId, name: targetClass },
      })
      if (targetClassRecord) {
        // Via Child model (legacy)
        const children = await prisma.child.findMany({
          where: { classId: targetClassRecord.id },
          select: { parentId: true },
        })
        // Via ParentStudentLink
        const studentLinks = await prisma.parentStudentLink.findMany({
          where: {
            student: { classId: targetClassRecord.id, schoolId: user.schoolId },
          },
          select: { userId: true },
        })
        const parentIds = Array.from(new Set([
          ...children.map(c => c.parentId),
          ...studentLinks.map(l => l.userId),
        ]))
        if (parentIds.length > 0) {
          parentUsers = await prisma.user.findMany({
            where: { id: { in: parentIds } },
            select: { id: true, email: true, name: true, phone: true },
          })
        }
      }
    }

    // Create delivery records and dispatch
    const deliveryPromises: Promise<void>[] = []
    const alertBody = `[${type || 'ALERT'}] ${title}\n\n${message}`

    for (const parent of parentUsers) {
      // Push notification delivery
      if (sendPush !== false) {
        deliveryPromises.push(
          prisma.alertDelivery.create({
            data: { alertId: alert.id, parentId: parent.id, channel: 'PUSH', status: 'SENT', sentAt: new Date() },
          }).then(() => {})
        )
      }

      // SMS delivery
      if (sendSms && parent.phone) {
        deliveryPromises.push(
          (async () => {
            const delivery = await prisma.alertDelivery.create({
              data: { alertId: alert.id, parentId: parent.id, channel: 'SMS', status: 'PENDING' },
            })
            const result = await sendSMS(parent.phone!, alertBody)
            await prisma.alertDelivery.update({
              where: { id: delivery.id },
              data: {
                status: result ? 'SENT' : 'FAILED',
                externalId: result?.sid || null,
                error: result ? null : 'SMS send failed',
                sentAt: result ? new Date() : null,
              },
            })
          })()
        )
      }

      // WhatsApp delivery
      if (sendWhatsapp && parent.phone) {
        deliveryPromises.push(
          (async () => {
            const delivery = await prisma.alertDelivery.create({
              data: { alertId: alert.id, parentId: parent.id, channel: 'WHATSAPP', status: 'PENDING' },
            })
            const result = await sendWhatsApp(parent.phone!, alertBody)
            await prisma.alertDelivery.update({
              where: { id: delivery.id },
              data: {
                status: result ? 'SENT' : 'FAILED',
                externalId: result?.sid || null,
                error: result ? null : 'WhatsApp send failed',
                sentAt: result ? new Date() : null,
              },
            })
          })()
        )
      }

      // Email delivery
      if (doSendEmail) {
        deliveryPromises.push(
          (async () => {
            const delivery = await prisma.alertDelivery.create({
              data: { alertId: alert.id, parentId: parent.id, channel: 'EMAIL', status: 'PENDING' },
            })
            const emailHtml = `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: ${severity === 'CRITICAL' ? '#DC2626' : severity === 'HIGH' ? '#EA580C' : '#F59E0B'}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; font-size: 20px;">Emergency Alert: ${title}</h1>
                  <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.9;">${type || 'GENERAL'} - ${severity || 'HIGH'} severity</p>
                </div>
                <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                  <p style="font-size: 16px; line-height: 1.5; color: #374151;">${message}</p>
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                  <p style="font-size: 12px; color: #9ca3af;">This is an emergency alert from your school. Please take immediate action if required.</p>
                </div>
              </div>
            `
            const success = await sendEmail({
              to: parent.email,
              subject: `EMERGENCY: ${title}`,
              html: emailHtml,
              text: alertBody,
            })
            await prisma.alertDelivery.update({
              where: { id: delivery.id },
              data: {
                status: success ? 'SENT' : 'FAILED',
                error: success ? null : 'Email send failed',
                sentAt: success ? new Date() : null,
              },
            })
          })()
        )
      }
    }

    // Send push notifications via existing notification service (fire-and-forget)
    if (sendPush !== false) {
      sendNotification({
        req,
        type: 'EMERGENCY_ALERT',
        title: `EMERGENCY: ${title}`,
        body: message,
        resourceType: 'EMERGENCY_ALERT',
        resourceId: alert.id,
        data: { alertType: type || 'GENERAL', severity: severity || 'HIGH' },
        target: {
          targetClass: targetClass || 'Whole School',
          schoolId: user.schoolId,
        },
      })
    }

    // Fire-and-forget: dispatch SMS, WhatsApp, Email in parallel
    Promise.all(deliveryPromises).catch(err => {
      console.error('Error dispatching alert deliveries:', err)
    })

    logAudit({
      req,
      action: 'CREATE',
      resourceType: 'EMERGENCY_ALERT',
      resourceId: alert.id,
      metadata: { title, type, severity, targetClass, parentCount: parentUsers.length },
    })

    res.status(201).json({
      id: alert.id,
      title: alert.title,
      message: alert.message,
      type: alert.type,
      severity: alert.severity,
      status: alert.status,
      targetClass: alert.targetClass,
      parentCount: parentUsers.length,
      sentAt: alert.sentAt.toISOString(),
      createdAt: alert.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating alert:', error)
    res.status(500).json({ error: 'Failed to create emergency alert' })
  }
})

// ─── Parent: Acknowledge alert ───
router.post('/:id/acknowledge', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { device } = req.body // optional: "web", "ios", "android"

    const alert = await prisma.emergencyAlert.findFirst({
      where: { id, schoolId: user.schoolId, status: 'ACTIVE' },
    })
    if (!alert) return res.status(404).json({ error: 'Alert not found' })

    // Upsert acknowledgment
    const ack = await prisma.alertAcknowledgment.upsert({
      where: { alertId_parentId: { alertId: id, parentId: user.id } },
      update: {},
      create: { alertId: id, parentId: user.id, device: device || null },
    })

    res.json({ acknowledged: true, acknowledgedAt: ack.acknowledgedAt.toISOString() })
  } catch (error) {
    console.error('Error acknowledging alert:', error)
    res.status(500).json({ error: 'Failed to acknowledge alert' })
  }
})

// ─── Admin: Get acknowledgments for alert ───
router.get('/:id/acknowledgments', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const alert = await prisma.emergencyAlert.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        acknowledgments: {
          include: { parent: { select: { id: true, name: true, email: true } } },
          orderBy: { acknowledgedAt: 'asc' },
        },
      },
    })
    if (!alert) return res.status(404).json({ error: 'Alert not found' })

    // Count total targeted parents
    const targetWhere: any = { schoolId: user.schoolId, role: 'PARENT' }
    // Don't filter by class for now — whole school alerts target all parents
    const totalParents = await prisma.user.count({ where: targetWhere })

    res.json({
      totalParents,
      acknowledged: alert.acknowledgments.length,
      rate: totalParents > 0 ? Math.round((alert.acknowledgments.length / totalParents) * 100) : 0,
      acknowledgments: alert.acknowledgments.map(a => ({
        parentId: a.parent.id,
        parentName: a.parent.name,
        parentEmail: a.parent.email,
        acknowledgedAt: a.acknowledgedAt.toISOString(),
        device: a.device,
      })),
    })
  } catch (error) {
    console.error('Error fetching acknowledgments:', error)
    res.status(500).json({ error: 'Failed to fetch acknowledgments' })
  }
})

// ─── Admin: Resolve alert ───
router.put('/:id/resolve', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const existing = await prisma.emergencyAlert.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Alert not found' })
    }

    const alert = await prisma.emergencyAlert.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy: user.name,
      },
    })

    logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'EMERGENCY_ALERT',
      resourceId: id,
      metadata: { action: 'resolved', title: alert.title },
    })

    res.json({
      id: alert.id,
      status: alert.status,
      resolvedAt: alert.resolvedAt?.toISOString(),
      resolvedBy: alert.resolvedBy,
    })
  } catch (error) {
    console.error('Error resolving alert:', error)
    res.status(500).json({ error: 'Failed to resolve alert' })
  }
})

// ─── Admin: Resend to failed deliveries ───
router.post('/:id/resend', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const alert = await prisma.emergencyAlert.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' })
    }

    // Find failed deliveries
    const failedDeliveries = await prisma.alertDelivery.findMany({
      where: { alertId: id, status: 'FAILED' },
    })

    if (failedDeliveries.length === 0) {
      return res.json({ message: 'No failed deliveries to resend', resent: 0 })
    }

    const alertBody = `[${alert.type}] ${alert.title}\n\n${alert.message}`
    let resentCount = 0

    const resendPromises = failedDeliveries.map(async (delivery) => {
      // Get parent info
      const parent = await prisma.user.findUnique({
        where: { id: delivery.parentId },
        select: { id: true, email: true, phone: true },
      })
      if (!parent) return

      let success = false
      let externalId: string | null = null

      if (delivery.channel === 'SMS' && parent.phone) {
        const result = await sendSMS(parent.phone, alertBody)
        success = !!result
        externalId = result?.sid || null
      } else if (delivery.channel === 'WHATSAPP' && parent.phone) {
        const result = await sendWhatsApp(parent.phone, alertBody)
        success = !!result
        externalId = result?.sid || null
      } else if (delivery.channel === 'EMAIL') {
        success = await sendEmail({
          to: parent.email,
          subject: `EMERGENCY: ${alert.title}`,
          html: `<p><strong>${alert.title}</strong></p><p>${alert.message}</p>`,
          text: alertBody,
        })
      }

      await prisma.alertDelivery.update({
        where: { id: delivery.id },
        data: {
          status: success ? 'SENT' : 'FAILED',
          externalId: externalId || delivery.externalId,
          error: success ? null : `Resend failed`,
          sentAt: success ? new Date() : delivery.sentAt,
        },
      })

      if (success) resentCount++
    })

    await Promise.all(resendPromises)

    res.json({ message: `Resent ${resentCount} of ${failedDeliveries.length} failed deliveries`, resent: resentCount, total: failedDeliveries.length })
  } catch (error) {
    console.error('Error resending alert:', error)
    res.status(500).json({ error: 'Failed to resend alert' })
  }
})

export default router
