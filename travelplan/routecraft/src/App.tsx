import { RouterProvider } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { router } from '@/app/router';
import { Toaster } from '@/components/ui/sonner';

export default function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
      <Toaster richColors position="top-center" />
    </AppProviders>
  );
}
