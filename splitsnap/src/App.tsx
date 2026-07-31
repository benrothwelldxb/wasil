import { RouterProvider } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'

import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { router } from '@/router'

export default function App() {
  return (
    <ThemeProvider>
      {/* Honour the OS "reduce motion" setting across all animations. */}
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
      </MotionConfig>
    </ThemeProvider>
  )
}
