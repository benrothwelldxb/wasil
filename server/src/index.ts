import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import passport from 'passport'
import dotenv from 'dotenv'

import { configurePassport } from './middleware/passport.js'
import authRoutes from './routes/auth.js'
import messagesRoutes from './routes/messages.js'
import formsRoutes from './routes/forms.js'
import eventsRoutes from './routes/events.js'
import scheduleRoutes from './routes/schedule.js'
import termDatesRoutes from './routes/termDates.js'
import weeklyMessageRoutes from './routes/weeklyMessage.js'
import knowledgeRoutes from './routes/knowledge.js'
import pulseRoutes from './routes/pulse.js'
import usersRoutes from './routes/users.js'
import classesRoutes from './routes/classes.js'
import policiesRoutes from './routes/policies.js'
import filesRoutes from './routes/files.js'
import schoolsRoutes from './routes/schools.js'
import staffRoutes from './routes/staff.js'
import yearGroupsRoutes from './routes/yearGroups.js'
import auditLogsRoutes from './routes/auditLogs.js'
import notificationsRoutes from './routes/notifications.js'
import deviceTokensRoutes from './routes/deviceTokens.js'
import parentInvitationsRoutes from './routes/parentInvitations.js'
import studentsRoutes from './routes/students.js'
import linksRoutes from './routes/links.js'
import groupsRoutes from './routes/groups.js'
import ecaRoutes from './routes/eca.js'
import consultationsRoutes from './routes/consultations.js'
import analyticsRoutes from './routes/analytics.js'
import emergencyAlertsRoutes from './routes/emergencyAlerts.js'
import schoolServicesRoutes from './routes/schoolServices.js'
import inboxRoutes from './routes/inbox.js'
import searchRoutes from './routes/search.js'
import inclusionRoutes from './routes/inclusion.js'
import cafeteriaRoutes from './routes/cafeteria.js'
import { initFirebase } from './services/firebase.js'
import { cleanupExpiredTokens, sendConsultationReminders } from './services/cleanup.js'
import { cleanupOldAuditLogs } from './services/audit.js'

dotenv.config()

// Validate required environment variables
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL', 'TOTP_ENCRYPTION_KEY', 'CORS_ORIGIN']
if (process.env.NODE_ENV === 'production') {
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`)
    }
  }
}

// Initialize Firebase for push notifications (optional)
initFirebase()

const app = express()
const PORT = process.env.PORT || 4000

// Security headers
app.use(helmet())

// Middleware
app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
  credentials: true,
}))
app.use(express.json())

// Passport initialization (OAuth strategies only, no sessions)
app.use(passport.initialize())
configurePassport()

// Static file serving removed — files served from Cloudflare R2

// Routes
app.use('/auth', authRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/forms', formsRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/schedule', scheduleRoutes)
app.use('/api/term-dates', termDatesRoutes)
app.use('/api/weekly-message', weeklyMessageRoutes)
app.use('/api/knowledge', knowledgeRoutes)
app.use('/api/pulse', pulseRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/classes', classesRoutes)
app.use('/api/policies', policiesRoutes)
app.use('/api/files', filesRoutes)
app.use('/api/schools', schoolsRoutes)
app.use('/api/staff', staffRoutes)
app.use('/api/year-groups', yearGroupsRoutes)
app.use('/api/audit-logs', auditLogsRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/device-tokens', deviceTokensRoutes)
app.use('/api/parent-invitations', parentInvitationsRoutes)
app.use('/api/students', studentsRoutes)
app.use('/api/links', linksRoutes)
app.use('/api/groups', groupsRoutes)
app.use('/api/eca', ecaRoutes)
app.use('/api/consultations', consultationsRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/emergency-alerts', emergencyAlertsRoutes)
app.use('/api/school-services', schoolServicesRoutes)
app.use('/api/inbox', inboxRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/inclusion', inclusionRoutes)
app.use('/api/cafeteria', cafeteriaRoutes)

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)

  // Run token cleanup every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000
  cleanupExpiredTokens() // Run once on startup
  setInterval(cleanupExpiredTokens, SIX_HOURS)

  // Run consultation reminders every hour
  const ONE_HOUR = 60 * 60 * 1000
  sendConsultationReminders()
  setInterval(sendConsultationReminders, ONE_HOUR)

  // Run audit log retention cleanup daily (delete logs older than 1 year)
  const ONE_DAY = 24 * 60 * 60 * 1000
  cleanupOldAuditLogs()
  setInterval(cleanupOldAuditLogs, ONE_DAY)
})
