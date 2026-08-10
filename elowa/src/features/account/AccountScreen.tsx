import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { PrivacyNote } from '@/components/common/PrivacyNote';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import {
  useAccount,
  useCreateAccount,
  useDeviceSessions,
  useRevokeSession,
  useSignOut,
  useSyncNow,
} from '@/hooks/queries';
import { formatDayMonth } from '@/lib/date';

export function AccountScreen() {
  const navigate = useNavigate();
  const { data: account } = useAccount();
  const { data: sessions } = useDeviceSessions();
  const createAccount = useCreateAccount();
  const signOut = useSignOut();
  const syncNow = useSyncNow();
  const revokeSession = useRevokeSession();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const lastSync = syncNow.data?.status;

  return (
    <>
      <ScreenHeader eyebrow="Continuity" title="Account & backup" showBack />
      <Screen>
        {!account ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              You’ve been tracking without an account — everything is saved on this device. Create an
              account to back up your history and pick up where you left off on another device.
            </p>

            <Card className="mt-5 space-y-3 p-5">
              <p className="text-sm font-semibold text-foreground">Create your account</p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (optional)"
                className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (optional)"
                autoComplete="email"
                className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                className="w-full"
                disabled={createAccount.isPending}
                onClick={() =>
                  createAccount.mutate({
                    ...(name.trim() ? { displayName: name.trim() } : {}),
                    ...(email.trim() ? { email: email.trim() } : {}),
                  })
                }
              >
                {createAccount.isPending ? 'Setting up…' : 'Create account & back up'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Your existing history stays exactly as it is and is added to your account — nothing is lost.
              </p>
            </Card>

            <Card className="mt-4 flex items-start gap-3 p-4">
              <Icon name="Info" className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                In this browser build, sign-in with email or Apple/Google isn’t available and your
                backup is kept securely on this device. On the elowa mobile app, the same account
                signs you in across devices with end-to-end encrypted sync.
              </p>
            </Card>
          </>
        ) : (
          <>
            <Card className="mt-1 flex items-center gap-4 p-5">
              <span className="flex size-14 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
                {(account.displayName ?? account.email ?? 'E')[0]!.toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-foreground">
                  {account.displayName ?? 'Your account'}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {account.email ?? 'Backed up on this device'}
                </p>
              </div>
            </Card>

            <div className="mt-6">
              <SectionHeading>Backup</SectionHeading>
              <Card className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <Icon name="CheckCircle2" className="size-5 text-success" />
                  <span className="text-sm font-medium text-foreground">
                    {lastSync === 'synced' || lastSync === 'local_only' || !lastSync ? 'Up to date' : 'Needs attention'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your history is backed up so you won’t lose it. Backing up never blocks anything —
                  export and delete are always available.
                </p>
                <Button
                  variant="soft"
                  size="sm"
                  disabled={syncNow.isPending}
                  onClick={() => syncNow.mutate()}
                >
                  <Icon name="RefreshCw" className="size-4" />
                  {syncNow.isPending ? 'Backing up…' : 'Back up now'}
                </Button>
              </Card>
            </div>

            <div className="mt-6">
              <SectionHeading>Devices</SectionHeading>
              <Card className="divide-y divide-border/60">
                {(sessions ?? []).map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-4">
                    <span className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground">
                      <Icon name="Smartphone" className="size-5" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{s.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Active {formatDayMonth(s.lastActiveAt.slice(0, 10))}
                      </p>
                    </div>
                    {s.current ? (
                      <Badge variant="neutral">This device</Badge>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => revokeSession.mutate(s.id)}>
                        Sign out
                      </Button>
                    )}
                  </div>
                ))}
              </Card>
            </div>

            <div className="mt-6">
              <Card className="divide-y divide-border/60">
                <button
                  type="button"
                  onClick={() => setConfirmSignOut(true)}
                  className="flex min-h-14 w-full items-center gap-3 p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground">
                    <Icon name="LogOut" className="size-5" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-foreground">Sign out</span>
                </button>
              </Card>
              <p className="mt-2 px-1 text-xs text-muted-foreground">
                Signing out keeps your data on this device so you can keep tracking offline.
              </p>
            </div>
          </>
        )}

        <PrivacyNote className="mt-7" />
      </Screen>

      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign out?"
        description="Your check-ins and history stay on this device. You can sign back in any time."
        confirmLabel="Sign out"
        onConfirm={() => signOut.mutate({}, { onSuccess: () => navigate('/profile') })}
      />
    </>
  );
}
