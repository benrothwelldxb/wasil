import { describe, it, expect } from 'vitest'
import { marked } from 'marked'
import { repairPlaceholderLinkLabels } from '../src/services/linkLabels.js'

describe('repairPlaceholderLinkLabels', () => {
  it('shows the address when Desk\'s "text" placeholder was left in', () => {
    const md = 'Find out more here: [text](https://teachrex.co.uk/animals/)'
    expect(repairPlaceholderLinkLabels(md)).toBe('Find out more here: [teachrex.co.uk/animals](https://teachrex.co.uk/animals/)')
    const html = marked.parse(repairPlaceholderLinkLabels(md), { async: false }) as string
    expect(html).toContain('>teachrex.co.uk/animals</a>')
    expect(html).not.toContain('>text</a>')
  })

  it('handles "link text", an empty label, any case, and several links', () => {
    expect(repairPlaceholderLinkLabels('[Link Text](https://a.com) and [](https://b.com/x) and [TEXT](http://c.com)'))
      .toBe('[a.com](https://a.com) and [b.com/x](https://b.com/x) and [c.com](http://c.com)')
  })

  it('shows an email address for a mailto link', () => {
    expect(repairPlaceholderLinkLabels('[text](mailto:office@school.ae)')).toBe('[office@school.ae](mailto:office@school.ae)')
  })

  it('never touches a label someone chose, a mention, or the https:// placeholder', () => {
    const md = '[Pay here](https://www.payhub360.com) @[Rob Davies](/inbox/new?staff=abc) [textbook list](https://x.com) [text](https://)'
    expect(repairPlaceholderLinkLabels(md)).toBe(md)
  })
})
