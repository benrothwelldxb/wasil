import React from 'react'
import { useNavigate } from 'react-router-dom'
import { RichText, mentionStaffId } from '@wasil/shared'

/**
 * A rich body as parents see it: markdown, with staff @mentions rendered as
 * tappable chips that open a message to that person.
 *
 * The mention is stored as a link to `/inbox/new?staff=<id>`, so the behaviour
 * is the href — this component only decides how it looks and keeps the
 * navigation inside the router instead of reloading the app.
 *
 * Anything else stays an ordinary external link.
 */
export function RichBody({ content, className }: { content: string; className?: string }) {
  const navigate = useNavigate()

  return (
    <RichText
      content={content}
      className={className}
      renderLink={(href, children) => {
        const staffId = mentionStaffId(href)
        if (!staffId) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              style={{ color: '#C4506E', textDecoration: 'underline' }}
            >
              {children}
            </a>
          )
        }
        return (
          <button
            type="button"
            onClick={() => navigate(href)}
            style={{
              display: 'inline',
              padding: '1px 6px',
              margin: '0 1px',
              borderRadius: '999px',
              backgroundColor: '#F5EEF0',
              color: '#C4506E',
              fontWeight: 700,
              fontSize: '0.95em',
              lineHeight: 'inherit',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {children}
          </button>
        )
      }}
    />
  )
}
