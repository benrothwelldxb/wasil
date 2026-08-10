/**
 * AccountRepository — Phase 3 account, device sessions, consent records,
 * entitlement, share links, tombstones and user-pinned milestones. All stored
 * in the active (real/demo) namespace so demo never mixes with real data.
 */
import type {
  Account,
  ConsentRecord,
  ConsentType,
  DeviceSession,
  Entitlement,
  ShareLink,
  TimelineEvent,
  Tombstone,
} from '@/domain/models';
import { activeDriver } from '../storage/dataContext';
import { StorageKeys } from '../storage/namespace';

const FREE: Entitlement = { tier: 'free', source: 'free' };

export const accountRepository = {
  getAccount(): Account | null {
    return activeDriver().get<Account>(StorageKeys.account);
  },
  setAccount(account: Account | null): void {
    if (account) activeDriver().set(StorageKeys.account, account);
    else activeDriver().remove(StorageKeys.account);
  },

  getSessions(): DeviceSession[] {
    return activeDriver().get<DeviceSession[]>(StorageKeys.sessions) ?? [];
  },
  setSessions(sessions: DeviceSession[]): void {
    activeDriver().set(StorageKeys.sessions, sessions);
  },

  getConsents(): ConsentRecord[] {
    return activeDriver().get<ConsentRecord[]>(StorageKeys.consents) ?? [];
  },
  recordConsent(type: ConsentType, version: string, now: string): void {
    const list = this.getConsents().filter((c) => !(c.type === type && !c.withdrawnAt));
    list.push({ type, version, grantedAt: now });
    activeDriver().set(StorageKeys.consents, list);
  },
  withdrawConsent(type: ConsentType, now: string): void {
    const list = this.getConsents().map((c) =>
      c.type === type && !c.withdrawnAt ? { ...c, withdrawnAt: now } : c,
    );
    activeDriver().set(StorageKeys.consents, list);
  },
  hasConsent(type: ConsentType): boolean {
    return this.getConsents().some((c) => c.type === type && !c.withdrawnAt);
  },

  getEntitlement(): Entitlement {
    return activeDriver().get<Entitlement>(StorageKeys.entitlement) ?? FREE;
  },
  setEntitlement(ent: Entitlement): void {
    activeDriver().set(StorageKeys.entitlement, ent);
  },

  getShareLinks(): ShareLink[] {
    return activeDriver().get<ShareLink[]>(StorageKeys.shareLinks) ?? [];
  },
  setShareLinks(links: ShareLink[]): void {
    activeDriver().set(StorageKeys.shareLinks, links);
  },

  getTombstones(): Tombstone[] {
    return activeDriver().get<Tombstone[]>(StorageKeys.tombstones) ?? [];
  },
  addTombstone(t: Tombstone): void {
    activeDriver().set(StorageKeys.tombstones, [...this.getTombstones(), t]);
  },
  setTombstones(list: Tombstone[]): void {
    activeDriver().set(StorageKeys.tombstones, list);
  },

  getMilestones(): TimelineEvent[] {
    return activeDriver().get<TimelineEvent[]>(StorageKeys.milestones) ?? [];
  },
  addMilestone(m: TimelineEvent): void {
    activeDriver().set(StorageKeys.milestones, [...this.getMilestones(), m]);
  },
};
