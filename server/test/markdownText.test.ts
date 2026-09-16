import { describe, it, expect } from 'vitest'
import { stripMarkdown, repairTranslatedMarkdown } from '../src/services/markdownText.js'

/**
 * Weekly updates are authored as markdown. Two places have to undo that:
 * notification bodies (which have no formatting to give) and machine
 * translation (which pads the markers until they stop being markers).
 *
 * Both failures are quiet and parent-facing — a push that reads "**Sports
 * Day** is on - Friday", or an Arabic-speaking family seeing literal asterisks
 * where every English-speaking family sees bold.
 */
describe('stripMarkdown', () => {
  it('drops emphasis markers but keeps the words', () => {
    expect(stripMarkdown('**Sports Day** is on *Friday*.')).toBe('Sports Day is on Friday.')
  })

  it('flattens a bullet list into a readable sentence', () => {
    expect(stripMarkdown('- Bring PE kit\n- Water bottle')).toBe('Bring PE kit Water bottle')
  })

  it('keeps a link label and discards its target', () => {
    expect(stripMarkdown('Message [@Rob Davies](/inbox/new?staff=abc) for details.')).toBe(
      'Message @Rob Davies for details.'
    )
  })

  it('collapses paragraph breaks rather than leaving gaps in a push body', () => {
    expect(stripMarkdown('Line one\n\nLine two')).toBe('Line one Line two')
  })

  it('leaves plain text untouched', () => {
    expect(stripMarkdown('Sports Day is on Friday.')).toBe('Sports Day is on Friday.')
  })
})

describe('repairTranslatedMarkdown', () => {
  it('closes up padded bold so it still renders as bold', () => {
    expect(repairTranslatedMarkdown('** Friday ** is the day')).toBe('**Friday** is the day')
  })

  it('handles padding on only one side', () => {
    expect(repairTranslatedMarkdown('**Friday ** is the day')).toBe('**Friday** is the day')
  })

  it('repairs a link whose brackets have been spaced apart', () => {
    expect(repairTranslatedMarkdown('[ @Rob Davies ] ( /inbox/new?staff=abc )')).toBe(
      '[@Rob Davies](/inbox/new?staff=abc)'
    )
  })

  it('repairs padded italics', () => {
    expect(repairTranslatedMarkdown('Call * Rob * today')).toBe('Call *Rob* today')
  })

  it('leaves multiplication alone — a lone asterisk is not always emphasis', () => {
    expect(repairTranslatedMarkdown('2 * 3 * 4 equals 24')).toBe('2 * 3 * 4 equals 24')
    expect(repairTranslatedMarkdown('5 * x * 2 is fine')).toBe('5 * x * 2 is fine')
  })

  it('leaves bullet lists alone', () => {
    expect(repairTranslatedMarkdown('- Bring PE kit\n- Water bottle')).toBe(
      '- Bring PE kit\n- Water bottle'
    )
  })

  it('is a no-op on markdown that survived translation intact', () => {
    expect(repairTranslatedMarkdown('**Already fine** and *so is this*')).toBe(
      '**Already fine** and *so is this*'
    )
  })
})
