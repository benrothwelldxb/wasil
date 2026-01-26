import express from 'express'
import cors from 'cors'
import session from 'express-session'
import cookieParser from 'cookie-parser'
import passport from 'passport'
import dotenv from 'dotenv'

import { configurePassport } from './middleware/passport.js'
import authRoutes from './routes/auth.js'
import messagesRoutes from './routes/messages.js'
import surveysRoutes from './routes/surveys.js'
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

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'wasil-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}))

// Passport initialization
app.use(passport.initialize())
app.use(passport.session())
configurePassport()

// Routes
app.use('/auth', authRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/surveys', surveysRoutes)
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
})
