import { Link } from 'react-router-dom'
import { ArrowRight, HelpCircle, Lightbulb, VenetianMask } from 'lucide-react'
import { Card } from '@/components/ui/Card'

const actions = [
  { to: '/app/ask', label: 'Ask anonymously', icon: HelpCircle, color: 'text-lilac-deep', bg: 'bg-lilac-tint' },
  { to: '/app/ideas', label: 'Get an idea', icon: Lightbulb, color: 'text-yolk-deep', bg: 'bg-yolk-tint' },
  { to: '/app/accomplice', label: 'Ask an accomplice', icon: VenetianMask, color: 'text-sage-deep', bg: 'bg-sage-tint' },
]

export function QuickActions() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {actions.map(({ to, label, icon: Icon, color, bg }) => (
        <Link key={to} to={to} className="group">
          <Card interactive className="h-full">
            <div className="flex h-full flex-col justify-between gap-3 p-4">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full ${bg} ${color}`}>
                <Icon size={20} aria-hidden />
              </span>
              <span className="text-sm font-semibold leading-tight text-ink">{label}</span>
              <ArrowRight size={16} className={`${color}`} aria-hidden />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
