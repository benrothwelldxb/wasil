import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'

// Lazy-load pages so each route is a separate chunk, keeping the initial
// bundle small. The heavy OCR/Tesseract code only loads with the Review route
// (and Tesseract itself only when a scan actually runs).
const HomePage = lazy(() =>
  import('@/pages/HomePage').then((m) => ({ default: m.HomePage })),
)
const ScanPage = lazy(() =>
  import('@/pages/ScanPage').then((m) => ({ default: m.ScanPage })),
)
const ReviewPage = lazy(() =>
  import('@/pages/ReviewPage').then((m) => ({ default: m.ReviewPage })),
)
const SplitPage = lazy(() =>
  import('@/pages/SplitPage').then((m) => ({ default: m.SplitPage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'scan', element: <ScanPage /> },
      { path: 'review', element: <ReviewPage /> },
      { path: 'split', element: <SplitPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
