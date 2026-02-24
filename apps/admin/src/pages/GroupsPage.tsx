import React, { useState } from 'react'
import { Plus, Pencil, Trash2, Users, UserPlus, FolderPlus, X, Eye, EyeOff, UserMinus } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { Group, GroupCategory, GroupMember, GroupStaffAssignment, StudentSearchResult } from '@wasil/shared'
import { StudentSearchSelect } from '../components/StudentSearchSelect'

interface SelectedStudent {
  id: string
  fullName: string
  className: string
}

export function GroupsPage() {
  const theme = useTheme()
  const { data: groups, refetch: refetchGroups, isLoading: loadingGroups, error: errorGroups } = useApi<Group[]>(
    () => api.groups.list(),
    []
  )
  const { data: categories, refetch: refetchCategories, isLoading: loadingCategories } = useApi<GroupCategory[]>(
    () => api.groups.listCategories(),
    []
  )
  const { data: staffList } = useApi(() => api.staff.list(), [])

  const [activeTab, setActiveTab] = useState<'groups' | 'categories'>('groups')
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [showStaffModal, setShowStaffModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [editingCategory, setEditingCategory] = useState<GroupCategory | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'group' | 'category'; id: string; name: string } | null>(null)

  // Group form state
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [groupCategoryId, setGroupCategoryId] = useState('')
  const [groupIsActive, setGroupIsActive] = useState(true)

  // Category form state
  const [categoryName, setCategoryName] = useState('')
  const [categoryIcon, setCategoryIcon] = useState('')
  const [categoryColor, setCategoryColor] = useState('')

  // Members management
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [selectedStudents, setSelectedStudents] = useState<SelectedStudent[]>([])

  // Staff management
  const [staffAssignments, setStaffAssignments] = useState<GroupStaffAssignment[]>([])
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [staffCanMessage, setStaffCanMessage] = useState(true)
  const [staffCanManage, setStaffCanManage] = useState(false)

  const isLoading = loadingGroups || loadingCategories

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.colors.brandColor, borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (errorGroups) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <p className="font-medium">Failed to load groups</p>
          <p className="text-sm mt-1">{errorGroups.message}</p>
          <button onClick={() => refetchGroups()} className="mt-2 text-sm underline">Try again</button>
        </div>
      </div>
    )
  }

  const resetGroupForm = () => {
    setShowGroupForm(false)
    setEditingGroup(null)
    setGroupName('')
    setGroupDescription('')
    setGroupCategoryId('')
    setGroupIsActive(true)
  }

  const resetCategoryForm = () => {
    setShowCategoryForm(false)
    setEditingCategory(null)
    setCategoryName('')
    setCategoryIcon('')
    setCategoryColor('')
  }

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group)
    setGroupName(group.name)
    setGroupDescription(group.description || '')
    setGroupCategoryId(group.categoryId || '')
    setGroupIsActive(group.isActive)
    setShowGroupForm(true)
  }

  const handleEditCategory = (cat: GroupCategory) => {
    setEditingCategory(cat)
    setCategoryName(cat.name)
    setCategoryIcon(cat.icon || '')
    setCategoryColor(cat.color || '')
    setShowCategoryForm(true)
  }

  const handleSubmitGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!groupName.trim()) return

    setIsSubmitting(true)
    try {
      const data = {
        name: groupName.trim(),
        description: groupDescription.trim() || undefined,
        categoryId: groupCategoryId || undefined,
        isActive: groupIsActive,
      }

      if (editingGroup) {
        await api.groups.update(editingGroup.id, data)
      } else {
        await api.groups.create(data)
      }
      resetGroupForm()
      refetchGroups()
    } catch (error) {
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryName.trim()) return

    setIsSubmitting(true)
    try {
      const data = {
        name: categoryName.trim(),
        icon: categoryIcon.trim() || undefined,
        color: categoryColor.trim() || undefined,
      }

      if (editingCategory) {
        await api.groups.updateCategory(editingCategory.id, data)
      } else {
        await api.groups.createCategory(data)
      }
      resetCategoryForm()
      refetchCategories()
    } catch (error) {
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      if (deleteConfirm.type === 'group') {
        await api.groups.delete(deleteConfirm.id)
        refetchGroups()
      } else {
        await api.groups.deleteCategory(deleteConfirm.id)
        refetchCategories()
      }
      setDeleteConfirm(null)
    } catch (error) {
      alert(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const toggleGroupActive = async (group: Group) => {
    try {
      await api.groups.update(group.id, { isActive: !group.isActive })
      refetchGroups()
    } catch (error) {
      alert(`Failed to update: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const openMembersModal = async (group: Group) => {
    setSelectedGroup(group)
    setShowMembersModal(true)
    setLoadingMembers(true)
    try {
      const response = await api.groups.getMembers(group.id)
      setMembers(response.members)
    } catch (error) {
      console.error('Failed to load members:', error)
    } finally {
      setLoadingMembers(false)
    }
  }

  const closeMembersModal = () => {
    setShowMembersModal(false)
    setSelectedGroup(null)
    setMembers([])
    setSelectedStudents([])
  }

  const handleAddMembers = async () => {
    if (!selectedGroup || selectedStudents.length === 0) return
    try {
      await api.groups.addMembers(selectedGroup.id, selectedStudents.map(s => s.id))
      const response = await api.groups.getMembers(selectedGroup.id)
      setMembers(response.members)
      setSelectedStudents([])
      refetchGroups()
    } catch (error) {
      alert(`Failed to add members: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleRemoveMember = async (studentId: string) => {
    if (!selectedGroup) return
    try {
      await api.groups.removeMember(selectedGroup.id, studentId)
      setMembers(members.filter(m => m.studentId !== studentId))
      refetchGroups()
    } catch (error) {
      alert(`Failed to remove member: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const openStaffModal = async (group: Group) => {
    setSelectedGroup(group)
    setShowStaffModal(true)
    setLoadingStaff(true)
    try {
      const assignments = await api.groups.getStaff(group.id)
      setStaffAssignments(assignments)
    } catch (error) {
      console.error('Failed to load staff:', error)
    } finally {
      setLoadingStaff(false)
    }
  }

  const closeStaffModal = () => {
    setShowStaffModal(false)
    setSelectedGroup(null)
    setStaffAssignments([])
    setSelectedStaffId('')
    setStaffCanMessage(true)
    setStaffCanManage(false)
  }

  const handleAssignStaff = async () => {
    if (!selectedGroup || !selectedStaffId) return
    try {
      const assignment = await api.groups.assignStaff(selectedGroup.id, selectedStaffId, staffCanMessage, staffCanManage)
      // Update or add the assignment
      const existingIndex = staffAssignments.findIndex(a => a.userId === selectedStaffId)
      if (existingIndex >= 0) {
        setStaffAssignments(staffAssignments.map((a, i) => i === existingIndex ? assignment : a))
      } else {
        setStaffAssignments([...staffAssignments, assignment])
      }
      setSelectedStaffId('')
      setStaffCanMessage(true)
      setStaffCanManage(false)
      refetchGroups()
    } catch (error) {
      alert(`Failed to assign staff: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleRemoveStaff = async (userId: string) => {
    if (!selectedGroup) return
    try {
      await api.groups.removeStaff(selectedGroup.id, userId)
      setStaffAssignments(staffAssignments.filter(a => a.userId !== userId))
      refetchGroups()
    } catch (error) {
      alert(`Failed to remove staff: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Group groups by category
  const groupsByCategory = (categories || []).map(cat => ({
    ...cat,
    groups: (groups || []).filter(g => g.categoryId === cat.id),
  }))
  const uncategorizedGroups = (groups || []).filter(g => !g.categoryId)

  const suggestedIcons = ['⚽', '🎵', '♟️', '🎭', '📚', '🎨', '🏃', '🎾', '🏀', '🎸', '🎤', '💻']
  const suggestedColors = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899']

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Groups & Teams</h1>
          <p className="text-gray-600 mt-1">Organize students into sports teams, clubs, and activities</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowCategoryForm(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <FolderPlus className="w-5 h-5" />
            <span>Add Category</span>
          </button>
          <button
            onClick={() => setShowGroupForm(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            <Plus className="w-5 h-5" />
            <span>Add Group</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('groups')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'groups'
              ? 'border-current text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          style={activeTab === 'groups' ? { borderColor: theme.colors.brandColor, color: theme.colors.brandColor } : undefined}
        >
          Groups ({groups?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'categories'
              ? 'border-current text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          style={activeTab === 'categories' ? { borderColor: theme.colors.brandColor, color: theme.colors.brandColor } : undefined}
        >
          Categories ({categories?.length || 0})
        </button>
      </div>

      {/* Groups Tab */}
      {activeTab === 'groups' && (
        <>
          {/* Groups by Category */}
          {groupsByCategory.map(cat => cat.groups.length > 0 && (
            <div key={cat.id} className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                {cat.icon && <span className="mr-2">{cat.icon}</span>}
                {cat.name}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cat.groups.map(group => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    theme={theme}
                    onEdit={handleEditGroup}
                    onToggle={toggleGroupActive}
                    onDelete={(g) => setDeleteConfirm({ type: 'group', id: g.id, name: g.name })}
                    onManageMembers={openMembersModal}
                    onManageStaff={openStaffModal}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Uncategorized Groups */}
          {uncategorizedGroups.length > 0 && (
            <div className="mb-6">
              {(categories || []).length > 0 && (
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Other Groups</h2>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {uncategorizedGroups.map(group => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    theme={theme}
                    onEdit={handleEditGroup}
                    onToggle={toggleGroupActive}
                    onDelete={(g) => setDeleteConfirm({ type: 'group', id: g.id, name: g.name })}
                    onManageMembers={openMembersModal}
                    onManageStaff={openStaffModal}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {(groups || []).length === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No groups yet. Create groups for sports teams, clubs, and activities.</p>
            </div>
          )}
        </>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <>
          {(categories || []).length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="divide-y divide-gray-100">
                {(categories || []).map(cat => (
                  <div key={cat.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                        style={{ backgroundColor: cat.color ? `${cat.color}20` : '#f3f4f6' }}
                      >
                        {cat.icon || '📁'}
                      </div>
                      <div>
                        <span className="font-medium text-gray-900">{cat.name}</span>
                        <span className="ml-2 text-sm text-gray-500">
                          ({cat.groupCount || 0} groups)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEditCategory(cat)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ type: 'category', id: cat.id, name: cat.name })}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <FolderPlus className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No categories yet. Create categories like Sports, Music, or Clubs to organize groups.</p>
            </div>
          )}
        </>
      )}

      {/* Group Form Modal */}
      {showGroupForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingGroup ? 'Edit Group' : 'Add New Group'}
              </h2>
              <button onClick={resetGroupForm} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitGroup} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Group Name *</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. U11 Football, School Choir"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  placeholder="Brief description of this group"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={groupCategoryId}
                  onChange={(e) => setGroupCategoryId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No category</option>
                  {(categories || []).map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="groupIsActive"
                  checked={groupIsActive}
                  onChange={(e) => setGroupIsActive(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="groupIsActive" className="text-sm text-gray-700">Active (visible to parents)</label>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetGroupForm}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {isSubmitting ? 'Saving...' : editingGroup ? 'Update' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Form Modal */}
      {showCategoryForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingCategory ? 'Edit Category' : 'Add Category'}
              </h2>
              <button onClick={resetCategoryForm} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitCategory} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category Name *</label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g. Sports, Music, Clubs"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Icon (emoji)</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={categoryIcon}
                    onChange={(e) => setCategoryIcon(e.target.value)}
                    placeholder="Emoji"
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-center text-xl"
                    maxLength={4}
                  />
                  <div className="flex flex-wrap gap-1">
                    {suggestedIcons.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setCategoryIcon(emoji)}
                        className={`w-8 h-8 rounded hover:bg-gray-100 ${categoryIcon === emoji ? 'bg-gray-100 ring-2 ring-blue-500' : ''}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={categoryColor}
                    onChange={(e) => setCategoryColor(e.target.value)}
                    placeholder="#3B82F6"
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-1">
                    {suggestedColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setCategoryColor(color)}
                        className={`w-8 h-8 rounded ${categoryColor === color ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetCategoryForm}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {isSubmitting ? 'Saving...' : editingCategory ? 'Update' : 'Add Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Members Modal */}
      {showMembersModal && selectedGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Manage Members</h2>
                <p className="text-sm text-gray-500">{selectedGroup.name}</p>
              </div>
              <button onClick={closeMembersModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">Add Students</label>
              <div className="flex space-x-2">
                <div className="flex-1">
                  <StudentSearchSelect
                    selectedStudents={selectedStudents}
                    onChange={setSelectedStudents}
                    placeholder="Search for students to add..."
                  />
                </div>
                <button
                  onClick={handleAddMembers}
                  disabled={selectedStudents.length === 0}
                  className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingMembers ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.colors.brandColor, borderTopColor: 'transparent' }} />
                </div>
              ) : members.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No members yet. Add students using the search above.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {members.map(member => (
                    <div key={member.id} className="py-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-gray-900">{member.studentName}</span>
                        <span className="ml-2 text-sm text-gray-500">{member.className}</span>
                        {member.role && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                            {member.role}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveMember(member.studentId)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Staff Modal */}
      {showStaffModal && selectedGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Manage Staff</h2>
                <p className="text-sm text-gray-500">{selectedGroup.name}</p>
              </div>
              <button onClick={closeStaffModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">Assign Staff Member</label>
              <div className="space-y-3">
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select staff member...</option>
                  {(staffList || [])
                    .filter(s => !staffAssignments.find(a => a.userId === s.id))
                    .map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                    ))}
                </select>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={staffCanMessage}
                      onChange={(e) => setStaffCanMessage(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">Can message</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={staffCanManage}
                      onChange={(e) => setStaffCanManage(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">Can manage</span>
                  </label>
                </div>
                <button
                  onClick={handleAssignStaff}
                  disabled={!selectedStaffId}
                  className="w-full px-4 py-2 rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  Assign Staff
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingStaff ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.colors.brandColor, borderTopColor: 'transparent' }} />
                </div>
              ) : staffAssignments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No staff assigned yet.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {staffAssignments.map(assignment => (
                    <div key={assignment.id} className="py-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-gray-900">{assignment.userName}</span>
                        <span className="ml-2 text-sm text-gray-500">{assignment.userEmail}</span>
                        <div className="flex gap-1 mt-1">
                          {assignment.canMessage && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              Message
                            </span>
                          )}
                          {assignment.canManage && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              Manage
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveStaff(assignment.userId)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <ConfirmModal
          title={`Delete ${deleteConfirm.type === 'category' ? 'Category' : 'Group'}`}
          message={
            deleteConfirm.type === 'category'
              ? `Are you sure you want to delete the category "${deleteConfirm.name}"? Groups in this category will become uncategorized.`
              : `Are you sure you want to delete "${deleteConfirm.name}"? All member assignments will be removed.`
          }
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
          variant="danger"
        />
      )}
    </div>
  )
}

// Group card component
function GroupCard({
  group,
  theme,
  onEdit,
  onToggle,
  onDelete,
  onManageMembers,
  onManageStaff,
}: {
  group: Group
  theme: ReturnType<typeof useTheme>
  onEdit: (group: Group) => void
  onToggle: (group: Group) => void
  onDelete: (group: Group) => void
  onManageMembers: (group: Group) => void
  onManageStaff: (group: Group) => void
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-4 ${!group.isActive ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{group.name}</h3>
          {group.description && (
            <p className="text-sm text-gray-500 mt-1">{group.description}</p>
          )}
        </div>
        <button
          onClick={() => onToggle(group)}
          className={`p-1.5 rounded-lg ${group.isActive ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
          title={group.isActive ? 'Active' : 'Inactive'}
        >
          {group.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex items-center space-x-4 text-sm text-gray-600 mb-4">
        <div className="flex items-center">
          <Users className="w-4 h-4 mr-1" />
          {group.memberCount || 0} members
        </div>
        <div className="flex items-center">
          <UserPlus className="w-4 h-4 mr-1" />
          {group.staffCount || 0} staff
        </div>
      </div>

      <div className="flex items-center space-x-2 pt-3 border-t border-gray-100">
        <button
          onClick={() => onManageMembers(group)}
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          Members
        </button>
        <button
          onClick={() => onManageStaff(group)}
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          Staff
        </button>
        <button
          onClick={() => onEdit(group)}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(group)}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
