import { useState } from 'react';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { PrivacyNote } from '@/components/common/PrivacyNote';
import { EmptyState } from '@/components/common/EmptyState';
import { useShareLinks, useCreateShareLink, useRevokeShareLink, useAllSymptoms } from '@/hooks/queries';
import { shareService } from '@/services';
import { SHARE_EXPIRY_OPTIONS } from '@/services/sharing';
import { formatDayMonth } from '@/lib/date';
import type { ShareAudience } from '@/domain/models';
import { cn } from '@/lib/utils';

function shareUrl(token: string): string {
  return `${window.location.origin}/shared/${token}`;
}

export function ShareScreen() {
  const { data: links } = useShareLinks();
  const revoke = useRevokeShareLink();
  const [creating, setCreating] = useState<ShareAudience | null>(null);

  if (creating) {
    return <ShareBuilder audience={creating} onDone={() => setCreating(null)} />;
  }

  return (
    <>
      <ScreenHeader eyebrow="Sharing" title="Share your progress" showBack />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a private, read-only link. It expires automatically and you can revoke it any time.
          Links are yours to control — no health details are ever put in the link itself.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={() => setCreating('clinician')}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Icon name="Stethoscope" className="size-6" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Share with a clinician</p>
              <p className="text-xs text-muted-foreground">A focused summary for your appointment.</p>
            </div>
            <Icon name="ChevronRight" className="size-5 text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={() => setCreating('partner')}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Icon name="Users" className="size-6" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Share with a partner</p>
              <p className="text-xs text-muted-foreground">A gentle wellbeing snapshot — sensitive details stay private.</p>
            </div>
            <Icon name="ChevronRight" className="size-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-7">
          <SectionHeading>Your links</SectionHeading>
          {(links ?? []).length === 0 ? (
            <EmptyState icon="Link2" title="No links yet" description="Create a link above to share a read-only view." />
          ) : (
            <div className="space-y-3">
              {(links ?? []).map((l) => (
                <Card key={l.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground">
                      <Icon name={l.audience === 'clinician' ? 'Stethoscope' : 'Users'} className="size-5" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium capitalize text-foreground">{l.audience} link</p>
                      <p className="text-xs text-muted-foreground">
                        {l.state === 'active' ? `Expires ${formatDayMonth(l.expiresAt.slice(0, 10))}` : ''}
                        {l.state === 'expired' ? 'Expired' : ''}
                        {l.state === 'revoked' ? 'Revoked' : ''}
                      </p>
                    </div>
                    <Badge variant={l.state === 'active' ? 'positive' : 'neutral'}>{l.state}</Badge>
                  </div>
                  {l.state === 'active' ? (
                    <div className="mt-3 flex gap-2">
                      <Button variant="soft" size="sm" onClick={() => navigator.clipboard?.writeText(shareUrl(l.token))}>
                        <Icon name="Link2" className="size-4" /> Copy link
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => revoke.mutate(l.id)}>
                        Revoke
                      </Button>
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </div>

        <PrivacyNote className="mt-7" />
      </Screen>
    </>
  );
}

function ShareBuilder({ audience, onDone }: { audience: ShareAudience; onDone: () => void }) {
  const create = useCreateShareLink();
  const { data: symptoms } = useAllSymptoms();
  const partnerDefaults = audience === 'partner' ? shareService.partnerDefaults() : null;
  const clinicianDefaults = audience === 'clinician' ? shareService.clinicianDefaults() : null;
  const sections = (partnerDefaults ?? clinicianDefaults)!.sections;
  const included = (partnerDefaults ?? clinicianDefaults)!.symptomIds;
  const partnerExcluded = partnerDefaults?.excluded ?? [];

  const [expiryDays, setExpiryDays] = useState(7);
  const [optedIn, setOptedIn] = useState<string[]>([]);
  const [partnerNote, setPartnerNote] = useState('');
  const [created, setCreated] = useState<string | null>(null);

  const labelOf = (id: string) => symptoms?.find((s) => s.id === id)?.label ?? id;

  const submit = () => {
    const symptomIds = audience === 'partner' ? [...included, ...optedIn] : included;
    const link = create.mutate(
      {
        audience,
        sections,
        includedSymptomIds: symptomIds,
        expiryDays,
        ...(partnerNote.trim() ? { partnerNote: partnerNote.trim() } : {}),
      },
      { onSuccess: (l) => setCreated(shareUrl(l.token)) },
    );
    return link;
  };

  return (
    <>
      <ScreenHeader
        eyebrow="New link"
        title={audience === 'clinician' ? 'Clinician link' : 'Partner link'}
        showBack
        onBack={onDone}
      />
      <Screen>
        {created ? (
          <Card className="mt-1 space-y-3 p-5 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
              <Icon name="CheckCircle2" className="size-7" />
            </span>
            <p className="text-sm font-semibold text-foreground">Your link is ready</p>
            <p className="break-all rounded-xl bg-muted p-3 text-xs text-muted-foreground">{created}</p>
            <div className="flex justify-center gap-2">
              <Button size="sm" onClick={() => navigator.clipboard?.writeText(created)}>
                <Icon name="Link2" className="size-4" /> Copy link
              </Button>
              <Button size="sm" variant="ghost" onClick={onDone}>Done</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anyone with this link can view the read-only summary until it expires. Revoke it any time.
            </p>
          </Card>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {audience === 'clinician'
                ? 'A concise, read-only summary honouring anything you’ve hidden from reports.'
                : 'A lighter snapshot to help someone close to you understand how you’re doing. Sensitive categories are kept private unless you choose to include them.'}
            </p>

            <div className="mt-5">
              <SectionHeading>Link expires after</SectionHeading>
              <div className="flex gap-2">
                {SHARE_EXPIRY_OPTIONS.map((o) => (
                  <button
                    key={o.days}
                    type="button"
                    onClick={() => setExpiryDays(o.days)}
                    className={cn(
                      'flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                      expiryDays === o.days ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {audience === 'partner' && partnerExcluded.length > 0 ? (
              <div className="mt-6">
                <SectionHeading>Private by default</SectionHeading>
                <p className="mb-2 px-1 text-xs text-muted-foreground">
                  These stay private unless you turn them on for this link.
                </p>
                <Card className="divide-y divide-border/60">
                  {partnerExcluded.map((id) => (
                    <div key={id} className="flex items-center gap-3 p-4">
                      <Icon name="Lock" className="size-4 text-muted-foreground" />
                      <span className="flex-1 text-sm text-foreground">{labelOf(id)}</span>
                      <Switch
                        checked={optedIn.includes(id)}
                        onCheckedChange={(on) =>
                          setOptedIn((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)))
                        }
                        aria-label={`Include ${labelOf(id)}`}
                      />
                    </div>
                  ))}
                </Card>
              </div>
            ) : null}

            {audience === 'partner' ? (
              <div className="mt-6">
                <SectionHeading>A note (optional)</SectionHeading>
                <textarea
                  value={partnerNote}
                  onChange={(e) => setPartnerNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. Some quiet evenings help a lot right now."
                  className="w-full rounded-xl border border-input bg-card p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            ) : (
              <div className="mt-6">
                <SectionHeading>What’s included</SectionHeading>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">
                    A summary of your recent patterns and {included.length} tracked{' '}
                    {included.length === 1 ? 'symptom' : 'symptoms'}, plus your questions. Anything hidden from
                    reports is left out.
                  </p>
                </Card>
              </div>
            )}

            <Button className="mt-6 w-full" disabled={create.isPending} onClick={submit}>
              Create link
            </Button>
          </>
        )}
      </Screen>
    </>
  );
}
