/**
 * PWA install experience — a friendly, cross-platform "Add to Home Screen".
 *
 * Captures Chromium's install prompt (Android/desktop) and guides iOS Safari
 * users through the Share-sheet flow, via a dismissable banner and a Settings
 * control. No domain logic — pure install UX.
 */
export {
  useInstallPrompt,
  type InstallMode,
  type UseInstallPromptResult,
} from "./useInstallPrompt";
export { usePwaStore, isBannerSnoozed } from "./store";
export {
  useDeadlineReminder,
  type UseDeadlineReminderResult,
} from "./useDeadlineReminder";
export * from "./components";
