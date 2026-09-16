import React from 'react'
import ReactMarkdown from 'react-markdown'

/**
 * Restricted markdown body, shared by the admin composer's preview and every
 * parent-facing render of the same content.
 *
 * It lives in `shared` rather than being copied per app on purpose: a preview
 * that renders differently from the real thing is worse than no preview at all,
 * because it quietly teaches staff the wrong lesson about what parents will see.
 *
 * The element allowlist matches the inbox bodies in ConversationPage/InboxPage
 * (Desk's toolbar set) plus links, which announcements genuinely need.
 * react-markdown renders no raw HTML by default, and `unwrapDisallowed` turns
 * anything outside the list into plain text rather than dropping it — so a stray
 * markdown character degrades to something readable instead of vanishing.
 */
export const RICH_TEXT_ELEMENTS = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a']

export interface RichTextProps {
  content: string
  /** Render an `a` yourself — used for @mention chips. Falls back to a plain link. */
  renderLink?: (href: string, children: React.ReactNode) => React.ReactNode
  className?: string
}

export function RichText({ content, renderLink, className }: RichTextProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        allowedElements={RICH_TEXT_ELEMENTS}
        unwrapDisallowed
        components={{
          // Inline styles rather than classes: Tailwind's preflight strips list
          // markers, and this renders inside several different layouts.
          p: ({ children }) => <p style={{ margin: '0 0 0.75em' }}>{children}</p>,
          ul: ({ children }) => (
            <ul style={{ listStyle: 'disc', paddingLeft: '1.25em', margin: '0.5em 0' }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ listStyle: 'decimal', paddingLeft: '1.25em', margin: '0.5em 0' }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ margin: '0.15em 0' }}>{children}</li>,
          a: ({ href, children }) => {
            const target = href || ''
            if (renderLink) return <>{renderLink(target, children)}</>
            return (
              <a href={target} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Markdown → plain text, for the places that show a truncated taste of the body:
 * dashboard cards, list rows, and push notification bodies. Without this, a
 * parent's notification reads "**Sports Day** is on - Friday".
 *
 * Deliberately a small set of regexes rather than a parser: it only ever feeds
 * a truncated preview, so being approximate at the margins costs nothing, and
 * it has to run identically in the browser and (a copy of it) on the server.
 */
export function stripMarkdown(input: string): string {
  if (!input) return ''
  return (
    input
      // Links: keep the label, drop the target. Runs first so the @mention
      // chips (which are links) read as "@Rob Davies" rather than a URL.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Emphasis markers, longest run first so **bold** doesn't leave a stray *.
      .replace(/(\*\*\*|___)(.*?)\1/g, '$2')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // Leading list markers and blockquote/heading marks, per line.
      .replace(/^[ \t]*([-*+]|\d+\.)[ \t]+/gm, '')
      .replace(/^[ \t]*[>#]+[ \t]*/gm, '')
      // Collapse the blank lines that separate markdown paragraphs.
      .replace(/\s*\n\s*\n\s*/g, ' ')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  )
}
