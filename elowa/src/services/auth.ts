/**
 * Authentication (Phase 3).
 *
 * The production design uses passwordless email (magic link) + Sign in with
 * Apple/Google against the managed backend (see `docs/AUTH.md`). Those require a
 * server + OAuth and are NOT wired in this web build. What IS implemented is the
 * account MODEL and lifecycle against a local account record, so guest→account
 * migration, sync, device listing, sign-out and deletion all work end-to-end
 * and are testable. The UI is honest: cloud auth is presented as unavailable in
 * the browser.
 */
import type { Account, AuthMethod, DeviceSession } from '@/domain/models';
import { accountRepository } from './repositories';
import { makeId } from '@/lib/id';

function detectPlatform(): string {
  try {
    return navigator.userAgent.includes('Mobile') ? 'Mobile browser' : 'This browser';
  } catch {
    return 'This device';
  }
}

export const authService = {
  currentAccount(): Account | null {
    return accountRepository.getAccount();
  },

  isSignedIn(): boolean {
    return accountRepository.getAccount() !== null;
  },

  /** Create a local account (the guest→account step). Real backends add email verification. */
  createAccount(input: { method: AuthMethod; email?: string; displayName?: string; now: string }): Account {
    const account: Account = {
      id: makeId('acct'),
      method: input.method,
      ...(input.email ? { email: input.email } : {}),
      ...(input.displayName ? { displayName: input.displayName } : {}),
      createdAt: input.now,
    };
    accountRepository.setAccount(account);
    // Register this device session.
    const session: DeviceSession = {
      id: makeId('dev'),
      label: detectPlatform(),
      platform: detectPlatform(),
      lastActiveAt: input.now,
      current: true,
    };
    accountRepository.setSessions([session]);
    return account;
  },

  /**
   * Sign out. Local health data is preserved by default so the user keeps
   * offline access (documented in `docs/AUTH.md`); the account link is removed.
   * `wipeLocal` lets a user on a shared device clear it instead.
   */
  signOut(options: { wipeLocal?: boolean } = {}): void {
    accountRepository.setAccount(null);
    accountRepository.setSessions([]);
    if (options.wipeLocal) {
      // Caller handles data wipe via deleteAllData(); here we only drop the account.
    }
  },

  sessions(): DeviceSession[] {
    return accountRepository.getSessions();
  },

  revokeSession(id: string): void {
    accountRepository.setSessions(accountRepository.getSessions().filter((s) => s.id !== id || s.current));
  },
};
