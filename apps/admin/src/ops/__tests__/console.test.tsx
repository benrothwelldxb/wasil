import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'

// Stub the api.ops client; keep hooks/components (useApi, useToast, ConfirmModal)
// real so these are genuine interaction tests of the console UI.
const ops = vi.hoisted(() => ({
  searchParents: vi.fn(), parent: vi.fn(), resendInvite: vi.fn(), unlock: vi.fn(),
  invalidateSessions: vi.fn(), resetOnboarding: vi.fn(), magicLink: vi.fn(),
  metrics: vi.fn(), status: vi.fn(), incidents: vi.fn(), release: vi.fn(),
  schools: vi.fn(), jobs: vi.fn(), retryJob: vi.fn(), retryFailedJobs: vi.fn(),
  audit: vi.fn(), flags: vi.fn(), setFlagGlobal: vi.fn(), setFlagOverride: vi.fn(),
}))
vi.mock('@wasil/shared', async (orig) => {
  const actual = await orig<typeof import('@wasil/shared')>()
  return { ...actual, api: { ...actual.api, ops } }
})

import { ToastProvider } from '@wasil/shared'
import { ParentSupportPage } from '../ParentSupportPage'
import { CommandPalette } from '../CommandPalette'
import { OverviewPage } from '../OverviewPage'
import { FlagsPage, JobsPage, AuditPage, RunbooksPage } from '../pages'

function renderUI(ui: React.ReactNode, route = '/') {
  return render(<MemoryRouter initialEntries={[route]}><ToastProvider>{ui}</ToastProvider></MemoryRouter>)
}
function Location() { const l = useLocation(); return <div data-testid="loc">{l.pathname}</div> }

const parentDetail = {
  parent: {
    id: 'p1', name: 'Ben Smith', email: 'ben@example.com', role: 'PARENT', schoolId: 's1',
    invited: true, invitedAt: new Date().toISOString(), activated: false, lastLoginAt: null,
    createdAt: new Date().toISOString(), twoFactorEnabled: false, locked: true,
    lockedUntil: new Date(Date.now() + 3600_000).toISOString(), failedLoginAttempts: 5,
    children: [{ name: 'Amy Smith', className: 'Year 5' }],
  },
  authEvents: [{ event: 'verify_failed', ipAddress: '1.2.3.4', createdAt: new Date().toISOString(), metadata: null }],
  auditLogs: [], notifications: [], bookings: { clubs: [], consultations: [] },
}

beforeEach(() => {
  vi.clearAllMocks()
  ops.searchParents.mockResolvedValue({ results: [{ id: 'p1', name: 'Ben Smith', email: 'ben@example.com', schoolId: 's1', invited: true, activated: false, matchedVia: 'parent' }] })
  ops.parent.mockResolvedValue(parentDetail)
  ops.resendInvite.mockResolvedValue({ sent: true })
  ops.unlock.mockResolvedValue({ unlocked: true })
  ops.magicLink.mockResolvedValue({ url: 'https://app/auth/magic?token=abc', expiresAt: '' })
  ops.metrics.mockResolvedValue({
    generatedAt: '', scope: { schoolId: 's1' },
    parents: { total: 120, invited: 100, activated: 60, pendingInvitations: 40, notInvited: 20, activationRatePct: 60 },
    activity: { dailyActiveUsers: 12, weeklyActiveUsers: 45, activationsToday: 3, activationsThisWeek: 20 },
    auth: { successfulLogins24h: 30, failedVerifications24h: 2, lockouts24h: 0 },
    bookings: { created7d: 5, cancelled7d: 1, cancellationRatePct: 20 },
    notifications: { sent24h: 50, failed24h: 0, successRatePct: 100, byKind: {} },
    queue: { depth: 0, failedJobs: 0, oldestPendingAgeSec: null }, health: 'ok',
  })
  ops.status.mockResolvedValue({ generatedAt: '', overall: 'ok', components: [{ component: 'Database', state: 'ok', detail: 'SELECT 1' }] })
  ops.incidents.mockResolvedValue({ incidents: [] })
  ops.release.mockResolvedValue({ version: '1.0.0', commit: 'abcdef12', environment: 'test', migration: 'm1', sentryConfigured: false, startedAt: new Date().toISOString() })
  ops.flags.mockResolvedValue({ flags: [{ key: 'clubs', description: 'Clubs', enabledDefault: true, overrides: [] }] })
  ops.setFlagGlobal.mockResolvedValue({ flag: {} })
  ops.jobs.mockResolvedValue({ summary: { FAILED: 1, PENDING: 0, SENT: 2 }, entries: [{ id: 'j1', kind: 'EMAIL', status: 'FAILED', attempts: 1, lastError: 'boom', runAfter: '', failedAt: '', createdAt: new Date().toISOString(), schoolId: 's1' }] })
  ops.retryJob.mockResolvedValue({ retried: true })
  ops.audit.mockResolvedValue({ rows: [] })
})

describe('Parent Support', () => {
  it('searches and shows results', async () => {
    const user = userEvent.setup()
    renderUI(<ParentSupportPage />)
    await user.type(screen.getByPlaceholderText(/search parents/i), 'ben')
    // The result is a button; its accessible name spans the highlighted name.
    expect(await screen.findByRole('button', { name: /ben smith/i })).toBeInTheDocument()
    expect(ops.searchParents).toHaveBeenCalledWith('ben')
  })

  it('resends an invitation and shows a success toast', async () => {
    const user = userEvent.setup()
    renderUI(<ParentSupportPage />)
    await user.type(screen.getByPlaceholderText(/search parents/i), 'ben')
    await user.click(await screen.findByRole('button', { name: /ben smith/i }))
    await user.click(await screen.findByRole('button', { name: /resend invite/i }))
    await waitFor(() => expect(ops.resendInvite).toHaveBeenCalledWith('p1'))
    expect(await screen.findByText(/invitation re-sent/i)).toBeInTheDocument()
  })

  it('unlock requires confirmation then calls the API', async () => {
    const user = userEvent.setup()
    renderUI(<ParentSupportPage />)
    await user.type(screen.getByPlaceholderText(/search parents/i), 'ben')
    await user.click(await screen.findByRole('button', { name: /ben smith/i }))
    await user.click(await screen.findByRole('button', { name: /unlock/i }))
    // Confirmation modal appears; the action has NOT fired yet.
    expect(ops.unlock).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: /^confirm$/i }))
    await waitFor(() => expect(ops.unlock).toHaveBeenCalledWith('p1'))
  })
})

describe('Command Palette', () => {
  it('opens on ⌘K, filters, and navigates on Enter', async () => {
    const user = userEvent.setup()
    renderUI(<><CommandPalette /><Location /></>)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const input = await screen.findByPlaceholderText(/search pages/i)
    await user.type(input, 'audit')
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/ops/audit'))
  })

  it('live-searches parents and can resend from the palette', async () => {
    const user = userEvent.setup()
    renderUI(<><CommandPalette /><Location /></>)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await user.type(await screen.findByPlaceholderText(/search pages/i), 'ben')
    await user.click(await screen.findByTitle(/resend invite/i))
    await waitFor(() => expect(ops.resendInvite).toHaveBeenCalledWith('p1'))
  })
})

describe('Operations Dashboard', () => {
  it('renders key metric tiles', async () => {
    renderUI(<OverviewPage />)
    expect(await screen.findByText('120')).toBeInTheDocument() // parents total
    expect(await screen.findByText('All systems operational')).toBeInTheDocument()
  })
})

describe('Feature Flags', () => {
  it('toggles a flag globally', async () => {
    const user = userEvent.setup()
    renderUI(<FlagsPage />)
    const sw = await screen.findByRole('switch')
    await user.click(sw)
    await waitFor(() => expect(ops.setFlagGlobal).toHaveBeenCalledWith('clubs', false))
  })
})

describe('Background Jobs', () => {
  it('retries a failed job', async () => {
    const user = userEvent.setup()
    renderUI(<JobsPage />)
    await user.click(await screen.findByRole('button', { name: /^retry$/i }))
    await waitFor(() => expect(ops.retryJob).toHaveBeenCalledWith('j1'))
  })
})

describe('Audit Explorer', () => {
  it('applies filters and queries', async () => {
    const user = userEvent.setup()
    renderUI(<AuditPage />)
    await user.type(screen.getByPlaceholderText(/parent\/user id/i), 'p1')
    await user.click(screen.getByRole('button', { name: /search/i }))
    await waitFor(() => expect(ops.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'p1' })))
  })
})

describe('Runbooks', () => {
  it('filters runbooks by search', async () => {
    const user = userEvent.setup()
    renderUI(<RunbooksPage />)
    expect(screen.getByText(/parent cannot log in/i)).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText(/search runbooks/i), 'redis')
    expect(screen.queryByText(/parent cannot log in/i)).not.toBeInTheDocument()
  })
})
