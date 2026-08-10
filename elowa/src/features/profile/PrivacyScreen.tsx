import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Icon } from '@/components/ui/icon';
import { usePinnedSymptoms } from '@/hooks/usePinnedSymptoms';
import { useSymptomPrivacyMap, useSetSymptomPrivacy } from '@/hooks/queries';
import { privacyRepository } from '@/services/repositories';
import type { Relevance } from '@/domain/models';
import { downloadExport } from '@/services/dataManagement';
import { cn } from '@/lib/utils';

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

const RELEVANCE_LABEL: Record<Relevance, string> = {
  care: 'Focus',
  neutral: 'Normal',
  ignore: 'Don’t focus',
};

export function PrivacyScreen() {
  const pinned = usePinnedSymptoms();
  const { data: privacyMap } = useSymptomPrivacyMap();
  const setPrivacy = useSetSymptomPrivacy();

  const privacyFor = (id: string) => ({ ...privacyRepository.getFor(id), ...privacyMap?.[id] });

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

        {/* Focus & sensitive-topic controls */}
        {pinned.length > 0 ? (
          <div className="mt-6">
            <SectionHeading>What elowa focuses on</SectionHeading>
            <p className="mb-3 text-xs text-muted-foreground">
              Choose how much elowa highlights each area, and keep sensitive topics out of home
              insights, AI summaries and reports.
            </p>
            <div className="space-y-3">
              {pinned.map((s) => {
                const pr = privacyFor(s.id);
                const cycle: Relevance = pr.relevance === 'care' ? 'neutral' : pr.relevance === 'neutral' ? 'ignore' : 'care';
                return (
                  <Card key={s.id} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{s.label}</p>
                      <button
                        type="button"
                        onClick={() => setPrivacy.mutate({ symptomId: s.id, privacy: { ...pr, relevance: cycle } })}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-semibold',
                          pr.relevance === 'ignore'
                            ? 'border-border text-muted-foreground'
                            : 'border-primary bg-primary-soft text-primary',
                        )}
                      >
                        {RELEVANCE_LABEL[pr.relevance]}
                      </button>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      <PrivacyToggle
                        label="Hide from home insights"
                        checked={pr.excludeFromHome}
                        onToggle={() => setPrivacy.mutate({ symptomId: s.id, privacy: { ...pr, excludeFromHome: !pr.excludeFromHome } })}
                      />
                      <PrivacyToggle
                        label="Exclude from AI summaries"
                        checked={pr.excludeFromAI}
                        onToggle={() => setPrivacy.mutate({ symptomId: s.id, privacy: { ...pr, excludeFromAI: !pr.excludeFromAI } })}
                      />
                      <PrivacyToggle
                        label="Exclude from appointment report"
                        checked={pr.excludeFromReport}
                        onToggle={() => setPrivacy.mutate({ symptomId: s.id, privacy: { ...pr, excludeFromReport: !pr.excludeFromReport } })}
                      />
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : null}

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

function PrivacyToggle({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onToggle} aria-label={label} />
    </div>
  );
}
