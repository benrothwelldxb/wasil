import React, { useState } from 'react'
import { Plus, X, Pencil, Trash2, Copy, Eye, EyeOff, UtensilsCrossed, Upload, Download, ChevronDown, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal, useToast } from '@wasil/shared'
import type { CafeteriaMenu, CafeteriaCategory, CafeMenuItem } from '@wasil/shared'

// ==============================================
// Shared constants
// ==============================================

const DAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
]

const DIETARY_OPTIONS = ['Halal', 'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Nut-Free']

interface ItemForm {
  dayOfWeek: number
  name: string
  description: string
  dietaryTags: string[]
  calories: string
  isDefault: boolean
}

const emptyItem: ItemForm = { dayOfWeek: 1, name: '', description: '', dietaryTags: [], calories: '', isDefault: false }

const DAY_NAME_TO_NUM: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
}

function parseCsvToItems(csvText: string): ItemForm[] {
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length < 2) return []

  const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
  const dayIdx = headers.findIndex(h => h === 'day')
  const nameIdx = headers.findIndex(h => h === 'name' || h === 'dish')
  const descIdx = headers.findIndex(h => h === 'description' || h === 'desc')
  const tagsIdx = headers.findIndex(h => h === 'dietary' || h === 'tags' || h === 'dietary_tags')
  const calIdx = headers.findIndex(h => h === 'calories' || h === 'kcal' || h === 'cal')
  const mainIdx = headers.findIndex(h => h === 'main' || h === 'default')

  if (nameIdx === -1) return []

  const items: ItemForm[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim())
    const dayStr = dayIdx >= 0 ? cols[dayIdx]?.toLowerCase() : 'monday'
    const dayOfWeek = DAY_NAME_TO_NUM[dayStr] ?? 1

    items.push({
      dayOfWeek,
      name: cols[nameIdx] || '',
      description: descIdx >= 0 ? (cols[descIdx] || '') : '',
      dietaryTags: tagsIdx >= 0 && cols[tagsIdx] ? cols[tagsIdx].split(';').map(t => t.trim()).filter(Boolean) : [],
      calories: calIdx >= 0 ? (cols[calIdx] || '') : '',
      isDefault: mainIdx >= 0 ? ['yes', 'true', '1', 'main'].includes((cols[mainIdx] || '').toLowerCase()) : false,
    })
  }
  return items.filter(i => i.name.trim())
}

// ==============================================
// Cafe Menu Item Form (used in modal)
// ==============================================

interface CafeItemFormData {
  name: string
  description: string
  price: string
  dietaryTags: string[]
  allergens: string[]
  calories: string
}

const emptyCafeItem: CafeItemFormData = { name: '', description: '', price: '', dietaryTags: [], allergens: [], calories: '' }

// ==============================================
// Cafe Menu Tab
// ==============================================

function CafeMenuTab() {
  const theme = useTheme()
  const toast = useToast()
  const { data: categories, refetch } = useApi<CafeteriaCategory[]>(() => api.cafeteria.cafeMenuAll(), [])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'category' | 'item'; id: string; name: string } | null>(null)

  // Item form state
  const [itemModal, setItemModal] = useState<{ categoryId: string; editItem?: CafeMenuItem } | null>(null)
  const [itemForm, setItemForm] = useState<CafeItemFormData>(emptyCafeItem)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Category CRUD
  const handleSaveCategory = async () => {
    if (!categoryName.trim()) return
    setIsSubmitting(true)
    try {
      if (editingCategoryId) {
        await api.cafeteria.updateCategory(editingCategoryId, { name: categoryName.trim() })
        toast.success('Category updated')
      } else {
        await api.cafeteria.createCategory({ name: categoryName.trim() })
        toast.success('Category created')
      }
      setCategoryName('')
      setShowCategoryForm(false)
      setEditingCategoryId(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save category')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleCategory = async (cat: CafeteriaCategory) => {
    try {
      await api.cafeteria.updateCategory(cat.id, { isActive: !cat.isActive })
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update category')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.type === 'category') {
        await api.cafeteria.deleteCategory(deleteTarget.id)
      } else {
        await api.cafeteria.deleteCafeItem(deleteTarget.id)
      }
      toast.success(`${deleteTarget.type === 'category' ? 'Category' : 'Item'} deleted`)
      setDeleteTarget(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  // Item CRUD
  const openAddItem = (categoryId: string) => {
    setItemForm(emptyCafeItem)
    setItemModal({ categoryId })
  }

  const openEditItem = (categoryId: string, item: CafeMenuItem) => {
    setItemForm({
      name: item.name,
      description: item.description || '',
      price: item.price != null ? item.price.toString() : '',
      dietaryTags: item.dietaryTags || [],
      allergens: item.allergens || [],
      calories: item.calories != null ? item.calories.toString() : '',
    })
    setItemModal({ categoryId, editItem: item })
  }

  const handleSaveItem = async () => {
    if (!itemModal || !itemForm.name.trim()) return
    setIsSubmitting(true)
    try {
      const payload = {
        name: itemForm.name.trim(),
        description: itemForm.description.trim() || undefined,
        price: itemForm.price ? parseFloat(itemForm.price) : undefined,
        dietaryTags: itemForm.dietaryTags.length > 0 ? itemForm.dietaryTags : undefined,
        allergens: itemForm.allergens.length > 0 ? itemForm.allergens : undefined,
        calories: itemForm.calories ? parseInt(itemForm.calories) : undefined,
      }
      if (itemModal.editItem) {
        await api.cafeteria.updateCafeItem(itemModal.editItem.id, payload)
        toast.success('Item updated')
      } else {
        await api.cafeteria.addCafeItem(itemModal.categoryId, payload)
        toast.success('Item added')
      }
      setItemModal(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save item')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleItemAvailable = async (item: CafeMenuItem) => {
    try {
      await api.cafeteria.updateCafeItem(item.id, { isAvailable: !item.isAvailable })
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update item')
    }
  }

  return (
    <div>
      {/* Category list */}
      <div className="space-y-3">
        {(categories || []).map(cat => (
          <div key={cat.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {/* Category header */}
            <div className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => toggleExpand(cat.id)} className="text-slate-400 hover:text-slate-600">
                {expanded.has(cat.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              <h3 className="font-semibold text-slate-900 flex-1">{cat.name}</h3>
              <span className="text-xs text-slate-400">{cat.items?.length || 0} items</span>
              <button
                onClick={() => handleToggleCategory(cat)}
                className="p-1.5 rounded-lg hover:bg-slate-50"
                title={cat.isActive ? 'Deactivate' : 'Activate'}
              >
                {cat.isActive
                  ? <ToggleRight className="w-5 h-5 text-green-500" />
                  : <ToggleLeft className="w-5 h-5 text-slate-300" />
                }
              </button>
              <button
                onClick={() => { setEditingCategoryId(cat.id); setCategoryName(cat.name); setShowCategoryForm(true) }}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeleteTarget({ type: 'category', id: cat.id, name: cat.name })}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              {!cat.isActive && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0E4E6', color: '#7A6469' }}>
                  Inactive
                </span>
              )}
            </div>

            {/* Expanded items */}
            {expanded.has(cat.id) && (
              <div className="border-t border-slate-100">
                {(cat.items || []).length === 0 ? (
                  <p className="text-sm text-slate-400 px-4 py-3">No items in this category.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs text-slate-500 font-medium">
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Description</th>
                        <th className="px-4 py-2">Price</th>
                        <th className="px-4 py-2">Dietary</th>
                        <th className="px-4 py-2">Calories</th>
                        <th className="px-4 py-2 text-center">Available</th>
                        <th className="px-4 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(cat.items || []).map(item => (
                        <tr key={item.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 font-medium text-slate-900">{item.name}</td>
                          <td className="px-4 py-2.5 text-slate-500 max-w-[200px] truncate">{item.description || '-'}</td>
                          <td className="px-4 py-2.5 text-slate-700">{item.price != null ? `AED ${item.price.toFixed(2)}` : '-'}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {(item.dietaryTags || []).map(tag => (
                                <span key={tag} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#C4506E15', color: '#C4506E' }}>
                                  {tag}
                                </span>
                              ))}
                              {(item.allergens || []).length > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                                  {item.allergens.join(', ')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">{item.calories != null ? `${item.calories} kcal` : '-'}</td>
                          <td className="px-4 py-2.5 text-center">
                            <button onClick={() => handleToggleItemAvailable(item)}>
                              {item.isAvailable
                                ? <ToggleRight className="w-5 h-5 text-green-500 mx-auto" />
                                : <ToggleLeft className="w-5 h-5 text-slate-300 mx-auto" />
                              }
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditItem(cat.id, item)}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget({ type: 'item', id: item.id, name: item.name })}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="px-4 py-2 border-t border-slate-100">
                  <button
                    onClick={() => openAddItem(cat.id)}
                    className="flex items-center gap-1 text-sm font-medium hover:underline"
                    style={{ color: theme.colors.brandColor }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Item
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {categories && categories.length === 0 && (
          <p className="text-center text-slate-400 py-8">No cafe categories yet. Add one to get started.</p>
        )}
      </div>

      {/* Add Category button */}
      <div className="mt-4">
        <button
          onClick={() => { setEditingCategoryId(null); setCategoryName(''); setShowCategoryForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </div>

      {/* Category name modal */}
      {showCategoryForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {editingCategoryId ? 'Edit Category' : 'New Category'}
            </h3>
            <input
              type="text"
              value={categoryName}
              onChange={e => setCategoryName(e.target.value)}
              placeholder="Category name"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-4"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveCategory() }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowCategoryForm(false); setEditingCategoryId(null) }} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700">
                Cancel
              </button>
              <button onClick={handleSaveCategory} disabled={!categoryName.trim() || isSubmitting} className="px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50" style={{ backgroundColor: theme.colors.brandColor }}>
                {isSubmitting ? 'Saving...' : editingCategoryId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item modal */}
      {itemModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {itemModal.editItem ? 'Edit Item' : 'Add Item'}
              </h3>
              <button onClick={() => setItemModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={itemForm.name}
                  onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Item name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={itemForm.description}
                  onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Price (AED)</label>
                  <input
                    type="number"
                    value={itemForm.price}
                    onChange={e => setItemForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="0.00"
                    step="0.01"
                    min={0}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Calories (kcal)</label>
                  <input
                    type="number"
                    value={itemForm.calories}
                    onChange={e => setItemForm(f => ({ ...f, calories: e.target.value }))}
                    placeholder="e.g. 250"
                    min={0}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dietary Tags</label>
                <div className="flex flex-wrap gap-1.5">
                  {DIETARY_OPTIONS.map(tag => {
                    const selected = itemForm.dietaryTags.some(t => t.toLowerCase() === tag.toLowerCase())
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const tags = selected
                            ? itemForm.dietaryTags.filter(t => t.toLowerCase() !== tag.toLowerCase())
                            : [...itemForm.dietaryTags, tag]
                          setItemForm(f => ({ ...f, dietaryTags: tags }))
                        }}
                        className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors"
                        style={selected
                          ? { backgroundColor: '#C4506E', color: '#FFFFFF' }
                          : { backgroundColor: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }
                        }
                      >
                        {tag}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setItemModal(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={handleSaveItem}
                disabled={!itemForm.name.trim() || isSubmitting}
                className="px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                {isSubmitting ? 'Saving...' : itemModal.editItem ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${deleteTarget.type === 'category' ? 'Category' : 'Item'}`}
          message={`Delete "${deleteTarget.name}"? ${deleteTarget.type === 'category' ? 'All items in this category will also be deleted.' : ''} This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ==============================================
// Main Component with Tabs
// ==============================================

export function AdminCafeteriaPage() {
  const theme = useTheme()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<'weekly' | 'cafe'>('weekly')

  // Weekly menu state
  const { data: menus, refetch } = useApi<CafeteriaMenu[]>(() => api.cafeteria.listAll(), [])

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [weekOf, setWeekOf] = useState('')
  const [title, setTitle] = useState('')
  const [orderUrl, setOrderUrl] = useState('')
  const [items, setItems] = useState<ItemForm[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CafeteriaMenu | null>(null)
  const [duplicateTarget, setDuplicateTarget] = useState<CafeteriaMenu | null>(null)
  const [duplicateWeek, setDuplicateWeek] = useState('')

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setWeekOf('')
    setTitle('')
    setOrderUrl('')
    setItems([])
  }

  const handleEdit = async (menu: CafeteriaMenu) => {
    const full = await api.cafeteria.get(menu.id)
    setEditingId(menu.id)
    setWeekOf(full.weekOf)
    setTitle(full.title || '')
    setOrderUrl(full.orderUrl || '')
    setItems((full.items || []).map(i => ({
      dayOfWeek: i.dayOfWeek,
      name: i.name,
      description: i.description || '',
      dietaryTags: i.dietaryTags || [],
      calories: i.calories?.toString() || '',
      isDefault: i.isDefault,
    })))
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!weekOf) return
    setIsSubmitting(true)
    try {
      const payload = {
        weekOf,
        title: title || undefined,
        orderUrl: orderUrl || undefined,
        items: items.filter(i => i.name.trim()).map(i => ({
          dayOfWeek: i.dayOfWeek,
          name: i.name.trim(),
          description: i.description.trim() || undefined,
          dietaryTags: i.dietaryTags.length > 0 ? i.dietaryTags : undefined,
          calories: i.calories ? parseInt(i.calories) : undefined,
          isDefault: i.isDefault,
        })),
      }

      if (editingId) {
        await api.cafeteria.update(editingId, payload)
      } else {
        await api.cafeteria.create(payload)
      }
      resetForm()
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save menu')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await api.cafeteria.delete(deleteTarget.id)
    setDeleteTarget(null)
    refetch()
  }

  const handleDuplicate = async () => {
    if (!duplicateTarget || !duplicateWeek) return
    try {
      await api.cafeteria.duplicate(duplicateTarget.id, duplicateWeek)
      setDuplicateTarget(null)
      setDuplicateWeek('')
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to duplicate')
    }
  }

  const togglePublish = async (menu: CafeteriaMenu) => {
    await api.cafeteria.update(menu.id, { isPublished: !menu.isPublished })
    refetch()
  }

  const addItem = () => setItems(prev => [...prev, { ...emptyItem }])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))
  const updateItem = (idx: number, updates: Partial<ItemForm>) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Cafeteria</h2>
          <p className="text-sm text-slate-500 mt-1">Manage weekly lunch menus and permanent cafe items</p>
        </div>
        {activeTab === 'weekly' && (
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            <Plus className="w-4 h-4" />
            New Menu
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('weekly')}
          className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={activeTab === 'weekly'
            ? { backgroundColor: theme.colors.brandColor, color: '#FFFFFF' }
            : { color: '#64748B' }
          }
        >
          Weekly Menu
        </button>
        <button
          onClick={() => setActiveTab('cafe')}
          className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={activeTab === 'cafe'
            ? { backgroundColor: theme.colors.brandColor, color: '#FFFFFF' }
            : { color: '#64748B' }
          }
        >
          Cafe Menu
        </button>
      </div>

      {/* Cafe Menu Tab */}
      {activeTab === 'cafe' && <CafeMenuTab />}

      {/* Weekly Menu Tab */}
      {activeTab === 'weekly' && (
        <>
          {/* Form */}
          {showForm && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingId ? 'Edit Menu' : 'New Weekly Menu'}
                </h3>
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Week Of (Monday)</label>
                    <input
                      type="date"
                      value={weekOf}
                      onChange={e => setWeekOf(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Title (optional)</label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="e.g. Week 3 Menu"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Order URL (optional)</label>
                    <input
                      type="url"
                      value={orderUrl}
                      onChange={e => setOrderUrl(e.target.value)}
                      placeholder="https://caterer.com/order"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                {/* Menu items */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Menu Items</label>
                  <div className="space-y-3">
                    {items.map((item, idx) => (
                      <div key={idx} className="bg-slate-50 rounded-lg p-3 flex gap-3">
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <select
                              value={item.dayOfWeek}
                              onChange={e => updateItem(idx, { dayOfWeek: parseInt(e.target.value) })}
                              className="px-2 py-1.5 border border-slate-300 rounded text-sm w-28"
                            >
                              {DAY_OPTIONS.map(d => (
                                <option key={d.value} value={d.value}>{d.label}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={item.name}
                              onChange={e => updateItem(idx, { name: e.target.value })}
                              placeholder="Dish name"
                              className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm"
                              required
                            />
                            <label className="flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={item.isDefault}
                                onChange={e => updateItem(idx, { isDefault: e.target.checked })}
                              />
                              Main
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={item.description}
                              onChange={e => updateItem(idx, { description: e.target.value })}
                              placeholder="Description (optional)"
                              className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm"
                            />
                            <input
                              type="number"
                              value={item.calories}
                              onChange={e => updateItem(idx, { calories: e.target.value })}
                              placeholder="kcal"
                              className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm"
                              min={0}
                            />
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {DIETARY_OPTIONS.map(tag => {
                              const selected = item.dietaryTags.some(t => t.toLowerCase() === tag.toLowerCase())
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => {
                                    const tags = selected
                                      ? item.dietaryTags.filter(t => t.toLowerCase() !== tag.toLowerCase())
                                      : [...item.dietaryTags, tag]
                                    updateItem(idx, { dietaryTags: tags })
                                  }}
                                  className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors"
                                  style={selected
                                    ? { backgroundColor: '#C4506E', color: '#FFFFFF' }
                                    : { backgroundColor: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }
                                  }
                                >
                                  {tag}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <button type="button" onClick={() => removeItem(idx)} className="p-1 text-slate-400 hover:text-red-500 self-start">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <button
                      type="button"
                      onClick={addItem}
                      className="flex items-center gap-1 text-sm hover:underline"
                      style={{ color: theme.colors.brandColor }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Item
                    </button>
                    <label className="flex items-center gap-1 text-sm cursor-pointer hover:underline" style={{ color: '#5B8EC4' }}>
                      <Upload className="w-3.5 h-3.5" />
                      Import CSV
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = (evt) => {
                            const parsed = parseCsvToItems(evt.target?.result as string)
                            if (parsed.length > 0) {
                              setItems(prev => [...prev, ...parsed])
                            } else {
                              toast.warning('No items found. CSV should have columns: day, name, description, dietary, calories, main')
                            }
                          }
                          reader.readAsText(file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const csv = `day,name,description,dietary,calories,main
Monday,Chicken Biryani,Served with raita and salad,Halal,450,yes
Monday,Pasta Primavera,Penne with seasonal vegetables,Vegetarian,380,no
Tuesday,Fish Fingers,With chips and peas,,420,yes
Tuesday,Vegetable Curry,With rice and naan,Vegetarian;Halal,350,no`
                        const blob = new Blob([csv], { type: 'text/csv' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url; a.download = 'menu-template.csv'; a.click()
                        URL.revokeObjectURL(url)
                      }}
                      className="flex items-center gap-1 text-sm hover:underline"
                      style={{ color: '#7A6469' }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Template
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={resetForm} className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting} className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: theme.colors.brandColor }}>
                    {isSubmitting ? 'Saving...' : editingId ? 'Update Menu' : 'Create Menu'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Menu list */}
          <div className="space-y-3">
            {(menus || []).map(menu => (
              <div key={menu.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <UtensilsCrossed className="w-4 h-4 text-slate-400" />
                      <h3 className="font-semibold text-slate-900">
                        {menu.title || `Week of ${new Date(menu.weekOf + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                      </h3>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={menu.isPublished
                          ? { backgroundColor: '#E8F5EC', color: '#2D8B4E' }
                          : { backgroundColor: '#F0E4E6', color: '#7A6469' }
                        }
                      >
                        {menu.isPublished ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {menu.itemCount || 0} items
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => togglePublish(menu)}
                      className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                      title={menu.isPublished ? 'Unpublish' : 'Publish'}
                    >
                      {menu.isPublished ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => { setDuplicateTarget(menu); setDuplicateWeek('') }}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                      title="Duplicate to another week"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleEdit(menu)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteTarget(menu)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {menus && menus.length === 0 && (
              <p className="text-center text-slate-400 py-8">No menus created yet.</p>
            )}
          </div>

          {/* Delete confirmation */}
          {deleteTarget && (
            <ConfirmModal
              title="Delete Menu"
              message={`Delete the menu for week of ${deleteTarget.weekOf}? This cannot be undone.`}
              confirmLabel="Delete"
              variant="danger"
              onConfirm={handleDelete}
              onCancel={() => setDeleteTarget(null)}
            />
          )}

          {/* Duplicate modal */}
          {duplicateTarget && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-xl p-6 max-w-sm w-full">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Duplicate Menu</h3>
                <p className="text-sm text-slate-600 mb-3">Copy this menu to a new week:</p>
                <input
                  type="date"
                  value={duplicateWeek}
                  onChange={e => setDuplicateWeek(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-4"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDuplicateTarget(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700">Cancel</button>
                  <button onClick={handleDuplicate} disabled={!duplicateWeek} className="px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50" style={{ backgroundColor: theme.colors.brandColor }}>Duplicate</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
