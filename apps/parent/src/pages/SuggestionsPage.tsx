import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lightbulb, Check } from 'lucide-react'
import { api, useToast } from '@wasil/shared'
import { PageLogo } from '../components/PageHeader'

const CATEGORIES = ['Facilities', 'Communication', 'Learning', 'Food', 'Events', 'Other']

/**
 * A parent's suggestion to the school.
 *
 * THE NOTICE IS THE FEATURE as much as the form is. A suggestion box invites
 * people to write freely, and free writing about a school includes children's
 * names, staff names, safeguarding worries and complaints — none of which this
 * is the right route for, and two of which have their own routes that exist
 * precisely so they are recorded and answered properly.
 *
 * So the notice comes BEFORE the box, not beneath it, and says what this is
 * not. It is deliberately not a checkbox to dismiss: a tick is a thing people
 * click, and what is wanted here is a thing people read.
 */
export function SuggestionsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('')
  // No default. Whether a parent can be identified is their decision and the
  // app must not quietly make it — so neither is preselected and the button
  // stays disabled until one is chosen.
  const [anonymous, setAnonymous] = useState<boolean | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [nameWarned, setNameWarned] = useState(false)

  /**
   * Does this look like it contains somebody's name?
   *
   * A crude client-side heuristic on purpose. Checking against the real roster
   * would be a better detector and a worse idea: the answer would tell anybody
   * who tried whether a given name is a pupil at this school, which is a fact
   * the app should not confirm to a stranger.
   *
   * It nudges once and never blocks. A parent writing "Miss Taylor has been
   * wonderful" is not doing anything wrong, and a box that argues with people
   * about praise is a box nobody uses twice.
   */
  const looksLikeAName = (text: string): boolean => {
    const honorific = /\b(mr|mrs|ms|miss|mx|dr|sir|madam)\.?\s+[A-Z][a-z]+/
    if (honorific.test(text)) return true
    const words = text.split(/\s+/)
    let capsRun = 0
    for (const w of words) {
      const bare = w.replace(/[^A-Za-z]/g, '')
      if (bare.length > 1 && /^[A-Z][a-z]+$/.test(bare)) {
        capsRun++
        if (capsRun >= 2) return true
      } else {
        capsRun = 0
      }
    }
    return false
  }

  const handleSend = async () => {
    if (!body.trim() || anonymous === null) return
    if (!nameWarned && looksLikeAName(body)) {
      setNameWarned(true)
      return
    }
    setSending(true)
    try {
      await api.suggestions.send({
        body: body.trim(),
        category: category || undefined,
        anonymous,
      })
      setSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send your suggestion')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div style={{ paddingBottom: 24 }}>
        <PageLogo />
        <div className="px-4 py-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4" style={{ background: '#E8F5EC' }}>
            <Check className="w-7 h-7" style={{ color: '#2D8B4E' }} />
          </div>
          <h2 className="text-lg font-extrabold text-gray-900">Thank you — that has gone to the school.</h2>
          <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
            {anonymous
              ? 'You sent this anonymously, so the school cannot reply to it. Nothing here records who you are.'
              : 'You sent this with your name, so the school can come back to you about it.'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 px-5 py-2.5 rounded-xl text-white text-sm font-bold"
            style={{ backgroundColor: '#5B6EC4' }}
          >
            Back to home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageLogo />

      <div className="px-4 pb-10">
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#2D2225', margin: '4px 0 2px' }}>
          Suggestion box
        </h1>
        <div className="flex items-start gap-3 mt-3 mb-4">
          <Lightbulb className="w-5 h-5 mt-0.5 shrink-0" style={{ color: '#C4885B' }} />
          <p className="text-sm text-gray-600">
            This is for ideas about the school — things we could do better, or start doing.
            The leadership team reads them.
          </p>
        </div>

        {/* BEFORE the box, not beneath it. */}
        <div
          className="rounded-2xl p-4 mb-5 text-sm"
          style={{ background: '#FFF7EC', border: '1px solid #F3E1C7', color: '#7A5A2E' }}
        >
          <p className="font-bold mb-2">Before you write</p>
          <p className="mb-2">
            <strong>Please don’t include names</strong> — not your child’s, not another child’s,
            and not a member of staff’s. A name makes it about a person rather than an idea.
          </p>
          <p className="mb-1"><strong>This isn’t the place for:</strong></p>
          <ul className="list-disc pl-5 space-y-1 mb-2">
            <li>
              Anything about a child’s safety or wellbeing — please ring the school office today.
            </li>
            <li>
              A complaint — the complaints procedure exists so it is recorded and answered properly.
            </li>
            <li>
              Something about your own child — message their teacher.
            </li>
          </ul>
          <p>
            <strong>Anonymous means anonymous.</strong> We won’t know who sent it, so we can’t
            reply or ask you more.
          </p>
        </div>

        <label className="block text-sm font-semibold text-gray-700 mb-1">Your suggestion</label>
        <textarea
          value={body}
          onChange={e => { setBody(e.target.value); setNameWarned(false) }}
          rows={7}
          maxLength={2000}
          placeholder="What could the school do better, or start doing?"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
        />
        <p className="text-xs text-gray-400 mt-1 mb-4">{body.length}/2000</p>

        {/* Nudge, never a block. Shown once; sending again goes through. */}
        {nameWarned && (
          <div
            className="rounded-xl p-3 mb-4 text-sm"
            style={{ background: '#FFF0F0', border: '1px solid #F3C7C7', color: '#8B3A3A' }}
          >
            This looks like it might mention someone by name. Could you take the name out? If it
            needs to be about a person, the office or the complaints procedure is the better route.
            <br />
            <span className="text-xs">Press send again to send it as it is.</span>
          </div>
        )}

        <label className="block text-sm font-semibold text-gray-700 mb-1">What is it about? (optional)</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm mb-5"
        >
          <option value="">Not sure / something else</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <label className="block text-sm font-semibold text-gray-700 mb-2">How would you like to send it?</label>
        <div className="space-y-2 mb-6">
          <button
            type="button"
            onClick={() => setAnonymous(false)}
            className="w-full text-left px-4 py-3 rounded-xl border text-sm"
            style={{
              borderColor: anonymous === false ? '#5B6EC4' : '#E5E7EB',
              background: anonymous === false ? '#F2F4FD' : 'white',
            }}
          >
            <span className="font-bold text-gray-900">With my name</span>
            <span className="block text-gray-500 mt-0.5">The school can reply to you about it.</span>
          </button>
          <button
            type="button"
            onClick={() => setAnonymous(true)}
            className="w-full text-left px-4 py-3 rounded-xl border text-sm"
            style={{
              borderColor: anonymous === true ? '#5B6EC4' : '#E5E7EB',
              background: anonymous === true ? '#F2F4FD' : 'white',
            }}
          >
            <span className="font-bold text-gray-900">Anonymously</span>
            <span className="block text-gray-500 mt-0.5">
              We won’t know it was you. Nobody can reply, and nobody can ask you more about it.
            </span>
          </button>
        </div>

        <button
          onClick={handleSend}
          disabled={!body.trim() || anonymous === null || sending}
          className="w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40"
          style={{ backgroundColor: '#5B6EC4' }}
        >
          {sending ? 'Sending…' : nameWarned ? 'Send it anyway' : 'Send'}
        </button>
        {anonymous === null && body.trim() && (
          <p className="text-xs text-gray-400 text-center mt-2">
            Choose whether to send it with your name or anonymously.
          </p>
        )}
      </div>
    </div>
  )
}
