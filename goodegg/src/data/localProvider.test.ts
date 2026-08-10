import { describe, it, expect, beforeEach } from 'vitest'
import { LocalProvider } from './localProvider'
import type { BuddyProfileInput } from './provider'

function sampleProfile(name: string): BuddyProfileInput {
  return {
    preferred_name: name,
    birthday: null,
    drink: 'Flat white',
    sweet_or_savoury: 'sweet',
    favourite_snacks: ['Chocolate'],
    favourite_shops: ['M&S'],
    interests: ['Plants'],
    favourite_colours: ['Green'],
    little_things: 'Nice pens',
    dislikes: [],
    dietary_requirements: [],
    free_text: '',
  }
}

let p: LocalProvider
beforeEach(() => {
  p = new LocalProvider()
  p.reset()
})

describe('LocalProvider — happy path end to end', () => {
  it('create → join → profiles → draw → reveal → view → ask → answer', async () => {
    // Organiser creates a group
    await p.signIn('olivia@work.example', 'Olivia')
    const group = await p.createGroup({ name: 'Test Eggs', organiser_name: 'Olivia' })
    expect(group.status).toBe('open')

    // Four colleagues join and complete profiles
    const people = ['Ana', 'Ben', 'Cara', 'Dan']
    for (const name of people) {
      await p.signIn(`${name.toLowerCase()}@work.example`, name)
      await p.joinGroup(group.join_code, name)
      await p.upsertMyBuddyProfile(group.id, sampleProfile(name))
    }
    // Organiser also completes a profile
    await p.signIn('olivia@work.example', 'Olivia')
    await p.upsertMyBuddyProfile(group.id, sampleProfile('Olivia'))

    const participants = await p.listParticipants(group.id)
    expect(participants).toHaveLength(5)
    expect(participants.every((x) => x.profile_complete)).toBe(true)

    // Organiser runs the draw
    const result = await p.runDraw(group.id)
    expect(result.count).toBe(5)
    const drawn = await p.getGroup(group.id)
    expect(drawn?.status).toBe('drawn')

    // Ben reveals and views his buddy
    await p.signIn('ben@work.example', 'Ben')
    const receiverId = await p.getMyReceiverId(group.id)
    expect(receiverId).toBeTruthy()
    expect(receiverId).not.toBeNull()

    await p.markRevealed(group.id)
    expect(await p.hasRevealed(group.id)).toBe(true)

    const buddy = await p.getMyBuddy(group.id)
    expect(buddy).not.toBeNull()
    expect(buddy!.profile_id).toBe(receiverId)

    // Ben asks his buddy an anonymous question
    const q = await p.askQuestion(group.id, 'Favourite snack?')
    expect(q.recipient_id).toBe(receiverId)

    // The recipient sees the question WITHOUT the asker's identity
    const recipientEmail = `${buddy!.preferred_name.toLowerCase()}@work.example`
    await p.signIn(recipientEmail, buddy!.preferred_name)
    const forMe = await p.listQuestionsForMe(group.id)
    expect(forMe.length).toBeGreaterThan(0)
    expect(forMe[0]).not.toHaveProperty('sender_id')

    await p.answerQuestion(forMe[0]!.id, 'Percy Pigs, obviously.')

    // Ben sees the answer on his own thread
    await p.signIn('ben@work.example', 'Ben')
    const asked = await p.listQuestionsIAsked(group.id)
    expect(asked[0]?.answer).toBe('Percy Pigs, obviously.')
  })
})

describe('LocalProvider — secrecy rules', () => {
  it('never reveals the asker to the recipient', async () => {
    await p.signIn('ben@work.example', 'Ben')
    const forMe = await p.listQuestionsForMe('grp-good-eggs-2026')
    for (const q of forMe) {
      expect(Object.prototype.hasOwnProperty.call(q, 'sender_id')).toBe(false)
    }
  })

  it('the draw is idempotent — re-running does not change assignments', async () => {
    await p.signIn('olivia@work.example', 'Olivia')
    const group = await p.createGroup({ name: 'Idem', organiser_name: 'Olivia' })
    for (const name of ['A', 'B', 'C']) {
      await p.signIn(`${name}@x.example`, name)
      await p.joinGroup(group.join_code, name)
    }
    await p.signIn('olivia@work.example', 'Olivia')
    const first = await p.runDraw(group.id)
    const second = await p.runDraw(group.id)
    expect(second.count).toBe(first.count)

    // Assignments are stable across the re-run
    await p.signIn('A@x.example', 'A')
    const r1 = await p.getMyReceiverId(group.id)
    await p.signIn('olivia@work.example', 'Olivia')
    await p.runDraw(group.id)
    await p.signIn('A@x.example', 'A')
    const r2 = await p.getMyReceiverId(group.id)
    expect(r2).toBe(r1)
  })

  it('only the organiser can run the draw', async () => {
    await p.signIn('olivia@work.example', 'Olivia')
    const group = await p.createGroup({ name: 'Perm', organiser_name: 'Olivia' })
    for (const name of ['A', 'B', 'C']) {
      await p.signIn(`${name}@x.example`, name)
      await p.joinGroup(group.join_code, name)
    }
    // A non-organiser attempts the draw
    await p.signIn('A@x.example', 'A')
    await expect(p.runDraw(group.id)).rejects.toThrow(/organiser/i)
  })

  it('you can only ask once you have an assigned buddy', async () => {
    await p.signIn('olivia@work.example', 'Olivia')
    const group = await p.createGroup({ name: 'NoDraw', organiser_name: 'Olivia' })
    await p.signIn('z@x.example', 'Z')
    await p.joinGroup(group.join_code, 'Z')
    await expect(p.askQuestion(group.id, 'Hi?')).rejects.toThrow(/assigned buddy/i)
  })
})
