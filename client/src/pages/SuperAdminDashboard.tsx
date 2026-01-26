import React, { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { Shield, Building2, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { schools, SchoolWithCount } from '../services/api'
import { SchoolCard, EditSchoolModal } from '../components/schools'
import type { SchoolFormData } from '../components/schools'

export function SuperAdminDashboard() {
  const { user } = useAuth()
  const theme = useTheme()
  const [schoolList, setSchoolList] = useState<SchoolWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingSchool, setEditingSchool] = useState<SchoolWithCount | null>(null)

  // Redirect if not super admin
  if (user?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/" replace />
  }

  const fetchSchools = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await schools.list()
      setSchoolList(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schools')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSchools()
  }, [])

  const handleSave = async (id: string, data: SchoolFormData) => {
    await schools.updateBranding(id, data)
    await fetchSchools()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div
            className="p-3 rounded-xl"
            style={{ backgroundColor: theme.colors.brandColorLight }}
          >
            <Shield className="w-6 h-6" style={{ color: theme.colors.brandColor }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: theme.colors.brandColor }}>
              Super Admin
            </h1>
            <p className="text-gray-600">Manage school branding and configuration</p>
          </div>
        </div>
        <button
          onClick={fetchSchools}
          disabled={loading}
          className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && schoolList.length === 0 && (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">Loading schools...</p>
        </div>
      )}

      {/* Schools Grid */}
      {!loading && schoolList.length === 0 && !error && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No schools found</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {schoolList.map((school) => (
          <SchoolCard
            key={school.id}
            school={school}
            onEdit={setEditingSchool}
          />
        ))}
      </div>

      {/* Edit Modal */}
      {editingSchool && (
        <EditSchoolModal
          school={editingSchool}
          onClose={() => setEditingSchool(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
