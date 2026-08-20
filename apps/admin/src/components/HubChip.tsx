import React from 'react'

/**
 * Tiny pill badge shown next to a row's name when it was ingested from Wasil
 * Hub (`fromHub: true`). Purely presentational.
 */
export function HubChip() {
  return (
    <span
      title="Sourced from Wasil Hub"
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-indigo-50 text-indigo-600 border border-indigo-100"
    >
      Hub
    </span>
  )
}
