import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Camera, ArrowRight, ReceiptText, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/EmptyState'

const steps = [
  { icon: Camera, title: 'Snap', body: 'Photograph the receipt.' },
  { icon: ReceiptText, title: 'Review', body: 'Check the items.' },
  { icon: Users, title: 'Split', body: 'Tap who had what.' },
]

export function HomePage() {
  return (
    <div className="space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card to-secondary/40 p-8 shadow-card"
      >
        <div className="max-w-md">
          <p className="text-sm font-medium text-accent">SplitSnap</p>
          <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
            Split any receipt in seconds.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Snap a receipt. Tap who had what. Done.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="accent">
              <Link to="/scan">
                <Camera />
                Scan a receipt
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/review">
                Review
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </motion.section>

      <section className="grid gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i + 0.1, duration: 0.35 }}
          >
            <Card className="h-full">
              <CardContent className="flex flex-col gap-3 p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-foreground">
                  <step.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.body}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          Recent splits
        </h3>
        <EmptyState
          icon={ReceiptText}
          title="No splits yet"
          description="Your recent receipts will appear here once you scan one."
          action={
            <Button asChild variant="secondary">
              <Link to="/scan">
                <Camera />
                Scan your first receipt
              </Link>
            </Button>
          }
        />
      </section>
    </div>
  )
}
