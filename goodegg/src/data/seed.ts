/**
 * Demo dataset — "The Good Eggs 2026".
 *
 * Reproduces the spirit of the supplied reference art: the current user is Ben,
 * his secret buddy is Sarah, there's an October "Something spooky!" mission,
 * and there are real questions in flight so every screen has something to show.
 *
 * The group is already 'drawn', so Ben can reveal Sarah. The assignments form a
 * single cycle, so nobody has themselves and there are no reciprocals.
 */
import type {
  AnonymousQuestion,
  Assignment,
  BuddyProfile,
  Exclusion,
  Group,
  GroupMember,
  Mission,
  Profile,
} from '@/lib/types'

export interface DemoDb {
  profiles: Profile[]
  groups: Group[]
  members: GroupMember[]
  buddyProfiles: BuddyProfile[]
  assignments: Assignment[]
  exclusions: Exclusion[]
  questions: AnonymousQuestion[]
  missions: Mission[]
  /** id of the current signed-in demo user. */
  currentProfileId: string | null
  /** per-group reveal flag for the current user (client-only ceremony state). */
  revealed: Record<string, boolean>
  /** ids of inbox items marked read. */
  readInbox: string[]
}

// Stable ids so seeded relationships are easy to reason about.
const P = {
  ben: 'prof-ben',
  sarah: 'prof-sarah',
  amara: 'prof-amara',
  tom: 'prof-tom',
  priya: 'prof-priya',
  jack: 'prof-jack',
  chloe: 'prof-chloe',
} as const

const GROUP = 'grp-good-eggs-2026'
const YEAR = '2026'

function iso(daysAgo: number): string {
  // Fixed reference "now" for deterministic seeds: 10 Aug 2026.
  const base = Date.UTC(2026, 7, 10, 8, 30, 0)
  return new Date(base - daysAgo * 86400000).toISOString()
}

function profile(id: string, name: string, email: string): Profile {
  return { id, display_name: name, email, avatar_seed: id, created_at: iso(60) }
}

function member(
  id: string,
  profileId: string,
  role: GroupMember['role'],
  complete: boolean,
  joinedDaysAgo: number,
): GroupMember {
  return {
    id,
    group_id: GROUP,
    profile_id: profileId,
    role,
    joined_at: iso(joinedDaysAgo),
    profile_complete: complete,
  }
}

function buddy(
  profileId: string,
  data: Omit<BuddyProfile, 'id' | 'group_id' | 'profile_id' | 'updated_at'>,
): BuddyProfile {
  return {
    id: `bp-${profileId}`,
    group_id: GROUP,
    profile_id: profileId,
    updated_at: iso(5),
    ...data,
  }
}

export function createSeedDb(): DemoDb {
  const profiles: Profile[] = [
    profile(P.ben, 'Ben', 'ben@work.example'),
    profile(P.sarah, 'Sarah', 'sarah@work.example'),
    profile(P.amara, 'Amara', 'amara@work.example'),
    profile(P.tom, 'Tom', 'tom@work.example'),
    profile(P.priya, 'Priya', 'priya@work.example'),
    profile(P.jack, 'Jack', 'jack@work.example'),
    profile(P.chloe, 'Chloe', 'chloe@work.example'),
  ]

  const group: Group = {
    id: GROUP,
    name: 'The Good Eggs ' + YEAR,
    description: 'Our office Secret Buddy scheme for the year. Little surprises. Big smiles.',
    organiser_id: P.ben,
    status: 'drawn',
    join_code: 'GOODEGG',
    suggested_budget: 5,
    created_at: iso(40),
    draw_at: iso(6),
    reveal_date: '2026-12-18',
  }

  // Ben is organiser AND a participant (common in real life).
  const members: GroupMember[] = [
    member('mem-ben', P.ben, 'organiser', true, 40),
    member('mem-sarah', P.sarah, 'participant', true, 38),
    member('mem-amara', P.amara, 'participant', true, 37),
    member('mem-tom', P.tom, 'participant', true, 36),
    member('mem-priya', P.priya, 'participant', true, 30),
    member('mem-jack', P.jack, 'participant', false, 12),
    member('mem-chloe', P.chloe, 'participant', true, 20),
  ]

  const buddyProfiles: BuddyProfile[] = [
    buddy(P.sarah, {
      preferred_name: 'Sarah',
      birthday: '05-14',
      drink: 'Flat white, oat milk',
      sweet_or_savoury: 'sweet',
      favourite_snacks: ['Cadbury Dairy Milk', 'Percy Pigs'],
      favourite_shops: ['M&S', 'Amazon'],
      interests: ['Houseplants', 'Arsenal', 'Baking'],
      favourite_colours: ['Green', 'Orange'],
      little_things: 'Nice pens, pretty notebooks, surprise coffees and silly desk decorations.',
      dislikes: ['Turkish Delight'],
      dietary_requirements: [],
      free_text: 'A surprise flat white on a Monday would genuinely make my whole week.',
    }),
    buddy(P.ben, {
      preferred_name: 'Ben',
      birthday: null,
      drink: 'Builder’s tea, splash of milk',
      sweet_or_savoury: 'savoury',
      favourite_snacks: ['Salt & vinegar crisps', 'Cashews'],
      favourite_shops: ['Waterstones'],
      interests: ['Cycling', 'Sci-fi novels', 'Board games'],
      favourite_colours: ['Blue'],
      little_things: 'A good pen and a genuinely funny meme taped to my monitor.',
      dislikes: ['Coriander'],
      dietary_requirements: [],
      free_text: 'Recommend me a book and you are officially a Good Egg.',
    }),
    buddy(P.amara, {
      preferred_name: 'Amara',
      birthday: null,
      drink: 'Peppermint tea',
      sweet_or_savoury: 'both',
      favourite_snacks: ['Dark chocolate', 'Olives'],
      favourite_shops: ['Paperchase', 'Lush'],
      interests: ['Running', 'Podcasts', 'Ceramics'],
      favourite_colours: ['Terracotta'],
      little_things: 'A new podcast recommendation or a fancy tea bag.',
      dislikes: [],
      dietary_requirements: ['Vegetarian'],
      free_text: '',
    }),
    buddy(P.tom, {
      preferred_name: 'Tom',
      birthday: null,
      drink: 'Oat flat white',
      sweet_or_savoury: 'sweet',
      favourite_snacks: ['Haribo', 'Flapjacks'],
      favourite_shops: ['HMV'],
      interests: ['Vinyl records', 'Five-a-side', 'Cooking'],
      favourite_colours: ['Mustard'],
      little_things: 'A track recommendation or a good flapjack.',
      dislikes: ['Marzipan'],
      dietary_requirements: [],
      free_text: '',
    }),
    buddy(P.priya, {
      preferred_name: 'Priya',
      birthday: null,
      drink: 'Masala chai',
      sweet_or_savoury: 'savoury',
      favourite_snacks: ['Bombay mix', 'Popcorn'],
      favourite_shops: ['Oliver Bonas'],
      interests: ['Gardening', 'Watercolours', 'Netball'],
      favourite_colours: ['Sage green'],
      little_things: 'A packet of seeds or a nice sticky-note set.',
      dislikes: [],
      dietary_requirements: ['No nuts'],
      free_text: '',
    }),
    buddy(P.chloe, {
      preferred_name: 'Chloe',
      birthday: null,
      drink: 'Caramel latte',
      sweet_or_savoury: 'sweet',
      favourite_snacks: ['Maltesers', 'Biscoff'],
      favourite_shops: ['Tiger', 'Sephora'],
      interests: ['True crime', 'Yoga', 'Baking'],
      favourite_colours: ['Lilac'],
      little_things: 'A daft desk toy or a Biscoff biscuit with my coffee.',
      dislikes: [],
      dietary_requirements: [],
      free_text: '',
    }),
    // Jack has not completed his profile yet (profile_complete = false).
  ]

  // Single cycle: Ben→Sarah→Amara→Tom→Priya→Chloe→Jack→Ben
  // (Jack included even though his profile is incomplete.)
  const order = [P.ben, P.sarah, P.amara, P.tom, P.priya, P.chloe, P.jack]
  const assignments: Assignment[] = order.map((giver, i) => ({
    id: `asg-${i}`,
    group_id: GROUP,
    giver_id: giver,
    receiver_id: order[(i + 1) % order.length]!,
    created_at: iso(6),
  }))

  const exclusions: Exclusion[] = []

  // Ben (sender) asked Sarah (recipient) — answered.
  // Ben's own secret giver is Jack (Jack→Ben) — Jack asked Ben a question (pending),
  // shown to Ben with the asker hidden.
  const questions: AnonymousQuestion[] = [
    {
      id: 'q-ben-sarah',
      group_id: GROUP,
      sender_id: P.ben,
      recipient_id: P.sarah,
      question: 'Go-to pick-me-up on a rough day?',
      answer: 'Honestly? A surprise oat flat white and five minutes with my plants.',
      status: 'answered',
      created_at: iso(3),
      answered_at: iso(2),
    },
    {
      id: 'q-for-ben',
      group_id: GROUP,
      sender_id: P.jack, // hidden from Ben by the provider
      recipient_id: P.ben,
      question: 'What would make your Friday?',
      answer: null,
      status: 'pending',
      created_at: iso(1),
      answered_at: null,
    },
  ]

  const missions: Mission[] = [
    {
      id: 'mis-oct',
      group_id: GROUP,
      title: 'October mission',
      tagline: 'Something spooky!',
      body: 'Surprise your buddy with a little Halloween treat.',
      accent: 'sage',
      starts_at: '2026-10-01',
      ends_at: '2026-10-31',
      created_at: iso(10),
    },
    {
      id: 'mis-sept',
      group_id: GROUP,
      title: 'September mission',
      tagline: 'Fresh starts',
      body: 'Leave your buddy a note wishing them a great new term.',
      accent: 'lilac',
      starts_at: '2026-09-01',
      ends_at: '2026-09-30',
      created_at: iso(40),
    },
  ]

  return {
    profiles,
    groups: [group],
    members,
    buddyProfiles,
    assignments,
    exclusions,
    questions,
    missions,
    currentProfileId: P.ben,
    revealed: {},
    readInbox: [],
  }
}

export const DEMO_IDS = { ...P, group: GROUP }
