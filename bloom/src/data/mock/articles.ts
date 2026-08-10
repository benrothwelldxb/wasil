import type { LearningArticle } from '@/domain/models';

/**
 * Placeholder learning content. The BODY TEXT IS PLACEHOLDER — it deliberately
 * avoids inventing specific medical claims. The structure exists so that real,
 * professionally-reviewed content (with sources and review dates) can be dropped
 * in later without UI changes.
 */

const PLACEHOLDER_BODY: string[] = [
  'This is placeholder educational content for Phase 0. In the finished product, each article will be written and reviewed by qualified health professionals before publication.',
  'The goal of this section is to explain what is happening in plain, reassuring language, and to point towards questions worth discussing with your own clinician.',
  'Nothing here is intended as personal medical advice. Everyone’s experience is different, and this content is general information only.',
];

function article(
  partial: Omit<LearningArticle, 'body' | 'sources' | 'reviewedBy' | 'reviewedAt'>,
): LearningArticle {
  return {
    ...partial,
    body: PLACEHOLDER_BODY,
    reviewedBy: 'Clinical review pending',
    reviewedAt: '2026-05-01',
    sources: [
      { label: 'Placeholder source — to be added in a later phase' },
    ],
  };
}

export const MOCK_ARTICLES: readonly LearningArticle[] = [
  article({
    id: 'art_what_is_perimenopause',
    title: 'What is perimenopause?',
    slug: 'what-is-perimenopause',
    summary: 'The transition before menopause, and why symptoms can come and go.',
    category: 'understanding',
    readMinutes: 4,
  }),
  article({
    id: 'art_hormones_explained',
    title: 'How changing hormones can affect you',
    slug: 'changing-hormones',
    summary: 'A gentle overview of the hormonal shifts during this stage.',
    category: 'understanding',
    readMinutes: 5,
  }),
  article({
    id: 'art_sleep',
    title: 'Sleep and perimenopause',
    slug: 'sleep-and-perimenopause',
    summary: 'Why sleep can change, and small things that may help.',
    category: 'sleep',
    readMinutes: 4,
  }),
  article({
    id: 'art_night_sweats',
    title: 'Understanding hot flushes & night sweats',
    slug: 'hot-flushes-night-sweats',
    summary: 'What vasomotor symptoms are and how people describe them.',
    category: 'vasomotor',
    readMinutes: 3,
  }),
  article({
    id: 'art_mood',
    title: 'Mood, anxiety and low feelings',
    slug: 'mood-and-anxiety',
    summary: 'Emotional changes are common — you are not alone.',
    category: 'mood',
    readMinutes: 4,
  }),
  article({
    id: 'art_brain_fog',
    title: 'Brain fog and concentration',
    slug: 'brain-fog',
    summary: 'Forgetfulness and fuzzy thinking, explained calmly.',
    category: 'brain_fog',
    readMinutes: 3,
  }),
  article({
    id: 'art_cycle_changes',
    title: 'When your cycle becomes irregular',
    slug: 'cycle-changes',
    summary: 'Changing cycle length and flow during the transition.',
    category: 'cycle',
    readMinutes: 4,
  }),
  article({
    id: 'art_hrt_basics',
    title: 'HRT basics',
    slug: 'hrt-basics',
    summary: 'A neutral overview of what HRT is and questions to ask.',
    category: 'hrt',
    readMinutes: 6,
  }),
  article({
    id: 'art_genitourinary',
    title: 'Vaginal & urinary changes',
    slug: 'vaginal-urinary-symptoms',
    summary: 'Common but under-discussed symptoms, covered sensitively.',
    category: 'genitourinary',
    readMinutes: 4,
  }),
  article({
    id: 'art_lifestyle',
    title: 'Everyday lifestyle and wellbeing',
    slug: 'lifestyle',
    summary: 'Movement, food, alcohol and stress — general considerations.',
    category: 'lifestyle',
    readMinutes: 5,
  }),
  article({
    id: 'art_talking_clinician',
    title: 'Preparing to talk to your clinician',
    slug: 'talking-to-your-clinician',
    summary: 'How to make the most of a short appointment.',
    category: 'clinician',
    readMinutes: 3,
  }),
];

export function findArticle(slug: string): LearningArticle | undefined {
  return MOCK_ARTICLES.find((a) => a.slug === slug);
}
