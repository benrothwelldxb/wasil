import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout, FocusLayout } from '@/components/layout/AppLayout';
import { RequireOnboarded } from './RequireOnboarded';
import { TodayScreen } from '@/features/today/TodayScreen';
import { CheckInScreen } from '@/features/checkin/CheckInScreen';
import { InsightsScreen } from '@/features/insights/InsightsScreen';
import { CalendarScreen } from '@/features/calendar/CalendarScreen';
import { LearnScreen } from '@/features/learn/LearnScreen';
import { ArticleScreen } from '@/features/learn/ArticleScreen';
import { AppointmentScreen } from '@/features/appointment/AppointmentScreen';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { PrivacyScreen } from '@/features/profile/PrivacyScreen';
import { CycleScreen } from '@/features/cycle/CycleScreen';
import { TreatmentsScreen } from '@/features/treatments/TreatmentsScreen';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/today" replace /> },
      { path: '/today', element: <TodayScreen /> },
      { path: '/insights', element: <InsightsScreen /> },
      { path: '/calendar', element: <CalendarScreen /> },
      { path: '/cycle', element: <CycleScreen /> },
      { path: '/treatments', element: <TreatmentsScreen /> },
      { path: '/learn', element: <LearnScreen /> },
      { path: '/learn/:slug', element: <ArticleScreen /> },
      { path: '/appointment', element: <AppointmentScreen /> },
      { path: '/profile', element: <ProfileScreen /> },
      { path: '/privacy', element: <PrivacyScreen /> },
    ],
  },
  {
    element: <FocusLayout />,
    children: [
      {
        path: '/check-in',
        element: (
          <RequireOnboarded>
            <CheckInScreen />
          </RequireOnboarded>
        ),
      },
      { path: '/onboarding', element: <OnboardingScreen /> },
    ],
  },
  { path: '*', element: <Navigate to="/today" replace /> },
]);
