/**
 * Phase 14 — Identity-switcher state for the portal.
 *
 * `viewingAs`:
 *   - null  → I'm looking at my OWN data (default, server uses request.user.id)
 *   - <uid> → I'm looking at the data of the child whose user.id is <uid>
 *             (server validates the relationship via `?as=<uid>` query param)
 *
 * NOT persisted: each fresh app load resets to "我自己". Avoids the awkward
 * scenario where you closed the app while looking at your child and the next
 * time you open it you're confused about whose data you're seeing.
 *
 * Consumed by:
 *   - PortalAppShell header (renders the dropdown switcher)
 *   - All client-portal data hooks (`useClientDashboard`, `useMyAppointments`,
 *     `useMyDocuments`, `useMyConsents`, `useCounselors`) — each appends
 *     `?as=<uid>` to its request when set.
 */
import { create } from 'zustand';

interface ViewingContextState {
  viewingAs: string | null;
  viewingAsName: string | null;
  setViewingAs: (userId: string | null, name?: string | null) => void;
  reset: () => void;
}

export const useViewingContext = create<ViewingContextState>()((set) => ({
  viewingAs: null,
  viewingAsName: null,
  setViewingAs: (userId, name) => set({
    viewingAs: userId,
    viewingAsName: userId ? (name ?? null) : null,
  }),
  reset: () => set({ viewingAs: null, viewingAsName: null }),
}));
