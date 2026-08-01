import type { AppState } from "./appStore";

/**
 * Reusable, memo-friendly selectors for the app store. Using named selectors
 * keeps component subscriptions narrow so they only re-render on relevant
 * state changes.
 */
export const selectTheme = (state: AppState) => state.theme;
export const selectSidebarOpen = (state: AppState) => state.sidebarOpen;
export const selectIsLoading = (state: AppState) => state.isLoading;
