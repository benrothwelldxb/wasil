import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Search, Loader2 } from 'lucide-react'
import { api } from '@wasil/shared'
import type { StudentSearchResult } from '@wasil/shared'

interface SelectedStudent {
  id: string
  fullName: string
  className: string
}

interface StudentSearchSelectProps {
  selectedStudents: SelectedStudent[]
  onChange: (students: SelectedStudent[]) => void
  classId?: string
  placeholder?: string
}

export function StudentSearchSelect({
  selectedStudents,
  onChange,
  classId,
  placeholder = 'Search for students...',
}: StudentSearchSelectProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<StudentSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const searchStudents = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults([])
      return
    }

    setIsLoading(true)
    try {
      const data = await api.students.search(query, classId)
      // Filter out already selected students
      const selectedIds = new Set(selectedStudents.map(s => s.id))
      setResults(data.filter(s => !selectedIds.has(s.id)))
    } catch (error) {
      console.error('Search error:', error)
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [classId, selectedStudents])

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (searchQuery.length >= 2) {
      debounceRef.current = setTimeout(() => {
        searchStudents(searchQuery)
      }, 300)
    } else {
      setResults([])
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [searchQuery, searchStudents])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectStudent = (student: StudentSearchResult) => {
    onChange([
      ...selectedStudents,
      { id: student.id, fullName: student.fullName, className: student.className },
    ])
    setSearchQuery('')
    setResults([])
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const removeStudent = (id: string) => {
    onChange(selectedStudents.filter(s => s.id !== id))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      selectStudent(results[highlightIndex])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    } else if (e.key === 'Backspace' && searchQuery === '' && selectedStudents.length > 0) {
      removeStudent(selectedStudents[selectedStudents.length - 1].id)
    }
  }

  return (
    <div className="relative">
      {/* Selected students as pills */}
      {selectedStudents.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedStudents.map(student => (
            <span
              key={student.id}
              className="inline-flex items-center px-2.5 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
            >
              {student.fullName}
              <span className="ml-1 text-xs text-blue-600">({student.className})</span>
              <button
                type="button"
                onClick={() => removeStudent(student.id)}
                className="ml-1.5 p-0.5 hover:bg-blue-200 rounded-full"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={e => {
            setSearchQuery(e.target.value)
            setIsOpen(true)
            setHighlightIndex(0)
          }}
          onFocus={() => {
            if (searchQuery.length >= 2) {
              setIsOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && (searchQuery.length >= 2) && (
        <div
          ref={dropdownRef}
          className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {results.length === 0 && !isLoading && (
            <div className="px-4 py-3 text-sm text-gray-500">
              No students found
            </div>
          )}
          {results.map((student, index) => (
            <button
              key={student.id}
              type="button"
              onClick={() => selectStudent(student)}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 ${
                index === highlightIndex ? 'bg-blue-50' : ''
              }`}
            >
              <div>
                <span className="text-sm font-medium text-gray-900">
                  {student.fullName}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  {student.className}
                </span>
              </div>
              {student.hasParent && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  Has parent
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
