import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { downloadExport } from '@/services/dataManagement';

const POINTS: { icon: string; title: string; body: string }[] = [
  {
    icon: 'Lock',
    title: 'Stored on your device',
    body: 'Your check-ins, cycle records, treatments and notes are saved in this browser’s local storage — on this device only.',
  },
  {
    icon: 'User',
    title: 'No account needed',
    body: 'elowa does not require you to sign up or log in. There is no username or password.',
  },
  {
    icon: 'Shield',
    title: 'Nothing is uploaded',
    body: 'elowa does not currently send your health tracking data to any server, and there are no analytics or advertising trackers.',
  },
  {
    icon: 'Download',
    title: 'You can export anytime',
    body: 'Download a complete copy of your data as a JSON file whenever you like.',
  },
  {
    icon: 'Trash2',
    title: 'You can delete everything',
    body: 'Permanently remove all your data from this device in one step, from your profile.',
  },
];

export function PrivacyScreen() {
  return (
    <>
      <ScreenHeader eyebrow="How elowa handles your data" title="Data & privacy" showBack />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">
          Your health data is private and belongs to you. Here’s exactly how elowa works today.
        </p>

        <div className="mt-5 space-y-3">
          {POINTS.map((p) => (
            <Card key={p.title} className="flex items-start gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Icon name={p.icon} className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{p.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-5">
          <Button variant="outline" size="lg" className="w-full" onClick={() => downloadExport(new Date().toISOString())}>
            <Icon name="Download" className="size-5" />
            Export my data
          </Button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Because data lives only in this browser, clearing your browser storage or using a
          different device or browser will mean your history isn’t available there. A future phase
          may add optional, encrypted cloud sync — you’ll always choose whether to enable it.
        </p>
      </Screen>
    </>
  );
}
