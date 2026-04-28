import React, { useState } from 'react'
import { useApi } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { CafeteriaMenu, CafeteriaMenuItem } from '@wasil/shared'
import { ChevronLeft, ChevronRight, ExternalLink, UtensilsCrossed, Leaf, Wheat, AlertTriangle } from 'lucide-react'

const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const DIETARY_ICONS: Record<string, { color: string; label: string }> = {
  vegetarian: { color: '#2D8B4E', label: 'Vegetarian' },
  vegan: { color: '#5BA97B', label: 'Vegan' },
  halal: { color: '#5B8EC4', label: 'Halal' },
  'gluten-free': { color: '#E8A54B', label: 'Gluten Free' },
  'dairy-free': { color: '#8B6EAE', label: 'Dairy Free' },
  'nut-free': { color: '#C47A5B', label: 'Nut Free' },
}

const ALLERGEN_LABELS: Record<string, string> = {
  nuts: 'Nuts',
  peanuts: 'Peanuts',
  'tree-nuts': 'Tree Nuts',
  dairy: 'Dairy',
  milk: 'Milk',
  gluten: 'Gluten',
  wheat: 'Wheat',
  eggs: 'Eggs',
  soy: 'Soy',
  fish: 'Fish',
  shellfish: 'Shellfish',
  sesame: 'Sesame',
  mustard: 'Mustard',
  celery: 'Celery',
  lupin: 'Lupin',
  molluscs: 'Molluscs',
  sulphites: 'Sulphites',
}

function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - ((day + 6) % 7))
  return d.toISOString().split('T')[0]
}

function formatWeekLabel(weekOf: string): string {
  const start = new Date(weekOf + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 4) // Friday
  return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export function CafeteriaPage() {
  const [weekOffset, setWeekOffset] = useState(0)

  const currentMonday = (() => {
    const d = new Date()
    d.setDate(d.getDate() + weekOffset * 7)
    return getMonday(d)
  })()

  const { data: menu, isLoading } = useApi<CafeteriaMenu | null>(
    () => weekOffset === 0 ? api.cafeteria.current() : api.cafeteria.week(currentMonday),
    [weekOffset]
  )

  const today = new Date()
  const todayDayOfWeek = today.getDay()
  const isCurrentWeek = weekOffset === 0

  // Group items by day
  const itemsByDay = new Map<number, CafeteriaMenuItem[]>()
  if (menu?.items) {
    for (const item of menu.items) {
      if (!itemsByDay.has(item.dayOfWeek)) itemsByDay.set(item.dayOfWeek, [])
      itemsByDay.get(item.dayOfWeek)!.push(item)
    }
  }

  // School days (Mon-Fri = 1-5)
  const schoolDays = [1, 2, 3, 4, 5]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>
          Lunch Menu
        </h1>
        <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>
          {menu?.title || 'This week\'s school lunch menu'}
        </p>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#F5EEF0' }}
          aria-label="Previous week"
        >
          <ChevronLeft className="w-5 h-5" style={{ color: '#7A6469' }} />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold" style={{ color: '#2D2225' }}>
            {formatWeekLabel(currentMonday)}
          </p>
          {!isCurrentWeek && (
            <button onClick={() => setWeekOffset(0)} className="text-xs font-semibold" style={{ color: '#C4506E' }}>
              Back to this week
            </button>
          )}
        </div>
        <button
          onClick={() => setWeekOffset(w => w + 1)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#F5EEF0' }}
          aria-label="Next week"
        >
          <ChevronRight className="w-5 h-5" style={{ color: '#7A6469' }} />
        </button>
      </div>

      {/* Order button */}
      {menu?.orderUrl && (
        <a
          href={menu.orderUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-bold text-sm"
          style={{ backgroundColor: '#FFF7EC', color: '#8B5E0F', border: '1.5px solid #E8D5B0' }}
        >
          <ExternalLink className="w-4 h-4" />
          Order / Pay Online
        </a>
      )}

      {/* Menu image (if uploaded instead of items) */}
      {menu?.imageUrl && (
        <div className="bg-white rounded-[22px] overflow-hidden" style={{ border: '1.5px solid #F0E4E6' }}>
          <img src={menu.imageUrl} alt="Weekly Menu" className="w-full" />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-[22px] p-5 space-y-2" style={{ border: '1px solid #F0E4E6' }}>
              <div className="skeleton-pulse h-4 w-1/4 rounded" />
              <div className="skeleton-pulse h-6 w-3/4 rounded" />
            </div>
          ))}
        </div>
      ) : !menu || (itemsByDay.size === 0 && !menu.imageUrl) ? (
        <div className="bg-white rounded-[22px] p-12 text-center" style={{ border: '1.5px solid #F0E4E6' }}>
          <UtensilsCrossed className="w-12 h-12 mx-auto mb-4" style={{ color: '#D8CDD0' }} />
          <p className="font-medium" style={{ color: '#A8929A' }}>No menu published for this week</p>
        </div>
      ) : itemsByDay.size > 0 && (
        <div className="space-y-3">
          {schoolDays.map(day => {
            const dayItems = itemsByDay.get(day) || []
            if (dayItems.length === 0) return null
            const isToday = isCurrentWeek && todayDayOfWeek === day

            return (
              <div
                key={day}
                className="bg-white rounded-[22px] overflow-hidden"
                style={{
                  border: isToday ? '2px solid #C4506E' : '1.5px solid #F0E4E6',
                }}
              >
                {/* Day header */}
                <div
                  className="px-5 py-3 flex items-center justify-between"
                  style={{
                    backgroundColor: isToday ? '#FFF0F3' : '#FAF8F6',
                    borderBottom: '1px solid #F0E4E6',
                  }}
                >
                  <span className="text-sm font-bold" style={{ color: isToday ? '#C4506E' : '#2D2225' }}>
                    {DAY_FULL[day]}
                  </span>
                  {isToday && (
                    <span
                      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: '#C4506E', color: '#FFFFFF' }}
                    >
                      Today
                    </span>
                  )}
                </div>

                {/* Items */}
                <div className="px-5 py-3 space-y-4">
                  {dayItems.map(item => (
                    <div key={item.id}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-[15px] font-semibold" style={{ color: '#2D2225' }}>
                            {item.name}
                          </p>
                          {item.description && (
                            <p className="text-sm mt-0.5" style={{ color: '#7A6469' }}>
                              {item.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.price != null && (
                            <span
                              className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                              style={{ backgroundColor: '#F0F9FF', color: '#0369A1' }}
                            >
                              AED {item.price.toFixed(2)}
                            </span>
                          )}
                          {item.isDefault && (
                            <span
                              className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: '#EDFAF2', color: '#2D8B4E' }}
                            >
                              Main
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Nutritional info row */}
                      {(item.calories || item.protein || item.carbs || item.fat) && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.calories != null && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F5EEF0', color: '#7A6469' }}>
                              {item.calories} kcal
                            </span>
                          )}
                          {item.protein != null && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#EEF4FF', color: '#5B8EC4' }}>
                              P: {item.protein}g
                            </span>
                          )}
                          {item.carbs != null && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF7EC', color: '#8B5E0F' }}>
                              C: {item.carbs}g
                            </span>
                          )}
                          {item.fat != null && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF0F3', color: '#C4506E' }}>
                              F: {item.fat}g
                            </span>
                          )}
                        </div>
                      )}

                      {/* Dietary tags */}
                      {item.dietaryTags && item.dietaryTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {item.dietaryTags.map(tag => {
                            const config = DIETARY_ICONS[tag.toLowerCase()]
                            return (
                              <span
                                key={tag}
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                                style={{
                                  backgroundColor: (config?.color || '#7A6469') + '15',
                                  color: config?.color || '#7A6469',
                                }}
                              >
                                {config?.label || tag}
                              </span>
                            )
                          })}
                        </div>
                      )}

                      {/* Allergen warnings */}
                      {item.allergens && item.allergens.length > 0 && (
                        <div
                          className="flex items-start gap-2 mt-2 px-3 py-2 rounded-xl"
                          style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}
                        >
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
                          <p className="text-[11px] font-semibold" style={{ color: '#991B1B' }}>
                            Contains: {item.allergens.map(a => ALLERGEN_LABELS[a.toLowerCase()] || a).join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
