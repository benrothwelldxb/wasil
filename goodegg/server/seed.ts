import type { Db } from './db'

/**
 * Optional demo seed for a fresh deployment. Runs only when SEED_DEMO=true and
 * the database has no groups yet. Mirrors the in-browser demo: sign in as
 * ben@work.example (the code is emailed, or printed to the server log in dev
 * mode) to land on Ben's home with Sarah as his secret buddy.
 */
export async function maybeSeed(db: Db): Promise<void> {
  if (process.env.SEED_DEMO !== 'true') return
  const existing = await db.query('select 1 from groups limit 1')
  if (existing.rows[0]) return

  const P = {
    ben: 'prof-ben', sarah: 'prof-sarah', amara: 'prof-amara', tom: 'prof-tom',
    priya: 'prof-priya', jack: 'prof-jack', chloe: 'prof-chloe',
  }
  const G = 'grp-good-eggs-2026'
  const people: [string, string, string][] = [
    [P.ben, 'Ben', 'ben@work.example'],
    [P.sarah, 'Sarah', 'sarah@work.example'],
    [P.amara, 'Amara', 'amara@work.example'],
    [P.tom, 'Tom', 'tom@work.example'],
    [P.priya, 'Priya', 'priya@work.example'],
    [P.jack, 'Jack', 'jack@work.example'],
    [P.chloe, 'Chloe', 'chloe@work.example'],
  ]

  await db.tx(async (q) => {
    for (const [id, name, email] of people) {
      await q.query(
        'insert into profiles (id, display_name, email, avatar_seed) values ($1,$2,$3,$4) on conflict (id) do nothing',
        [id, name, email, id],
      )
    }
    await q.query(
      `insert into groups (id, name, description, organiser_id, status, join_code, suggested_budget, draw_at, reveal_date)
       values ($1,$2,$3,$4,'drawn','GOODEGG',5, now(), '2026-12-18')`,
      [G, 'The Good Eggs 2026', 'Our office Secret Buddy scheme for the year.', P.ben],
    )
    const roles: [string, string, boolean][] = [
      [P.ben, 'organiser', true], [P.sarah, 'participant', true], [P.amara, 'participant', true],
      [P.tom, 'participant', true], [P.priya, 'participant', true], [P.jack, 'participant', false],
      [P.chloe, 'participant', true],
    ]
    for (const [pid, role, complete] of roles) {
      await q.query(
        'insert into group_members (id, group_id, profile_id, role, profile_complete) values ($1,$2,$3,$4,$5)',
        [`mem-${pid}`, G, pid, role, complete],
      )
    }
    // Sarah — the rich profile from the brief.
    await q.query(
      `insert into buddy_profiles (id, group_id, profile_id, preferred_name, drink, sweet_or_savoury,
         favourite_snacks, favourite_shops, interests, favourite_colours, little_things, dislikes, free_text)
       values ($1,$2,$3,'Sarah','Flat white, oat milk','sweet',
         $4,$5,$6,$7,'Nice pens, pretty notebooks, surprise coffees and silly desk decorations.',$8,
         'A surprise flat white on a Monday would genuinely make my whole week.')`,
      [
        'bp-sarah', G, P.sarah,
        ['Cadbury Dairy Milk', 'Percy Pigs'], ['M&S', 'Amazon'],
        ['Houseplants', 'Arsenal', 'Baking'], ['Green', 'Orange'], ['Turkish Delight'],
      ],
    )
    // A light profile for everyone else so the draw has data to show.
    for (const [pid, name] of people.filter(([id]) => id !== P.sarah)) {
      await q.query(
        `insert into buddy_profiles (id, group_id, profile_id, preferred_name, drink, interests, little_things)
         values ($1,$2,$3,$4,'Tea',$5,'A good book recommendation.')`,
        [`bp-${pid}`, G, pid, name, ['Reading']],
      )
    }
    // Single cycle: Ben→Sarah→Amara→Tom→Priya→Chloe→Jack→Ben
    const order = [P.ben, P.sarah, P.amara, P.tom, P.priya, P.chloe, P.jack]
    for (let i = 0; i < order.length; i++) {
      await q.query(
        'insert into assignments (id, group_id, giver_id, receiver_id) values ($1,$2,$3,$4)',
        [`asg-${i}`, G, order[i], order[(i + 1) % order.length]],
      )
    }
    await q.query(
      `insert into missions (id, group_id, title, tagline, body, accent, starts_at, ends_at)
       values ('mis-oct',$1,'October mission','Something spooky!','Surprise your buddy with a little Halloween treat.','sage','2026-10-01','2026-10-31')`,
      [G],
    )
    await q.query(
      `insert into anonymous_questions (id, group_id, sender_id, recipient_id, question, answer, status, answered_at)
       values ('q-ben-sarah',$1,$2,$3,'Go-to pick-me-up on a rough day?','A surprise oat flat white and five minutes with my plants.','answered', now())`,
      [G, P.ben, P.sarah],
    )
    await q.query(
      `insert into anonymous_questions (id, group_id, sender_id, recipient_id, question, status)
       values ('q-for-ben',$1,$2,$3,'What would make your Friday?','pending')`,
      [G, P.jack, P.ben],
    )
  })
  console.log('[seed] Demo group "The Good Eggs 2026" created. Sign in as ben@work.example.')
}
