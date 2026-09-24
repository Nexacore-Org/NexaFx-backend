/**
 * Dashboard widget layout model.
 *
 * A `WidgetPlacement` describes a single widget on a user's dashboard: its
 * identifier, its order on the grid (`position`), whether it is currently
 * shown (`visible`) and optional per-widget configuration (e.g. chart period).
 */
export interface WidgetPlacement {
  id: string;
  position: number;
  visible: boolean;
  config?: Record<string, unknown>;
}

/**
 * The layout a brand-new user receives before they have saved any preference.
 * Kept deliberately conservative: the four core widgets are visible and the
 * portfolio widget is hidden until a user has holdings worth surfacing.
 */
export const DEFAULT_DASHBOARD_WIDGETS: readonly WidgetPlacement[] = [
  { id: 'balance-summary', position: 0, visible: true },
  { id: 'recent-transactions', position: 1, visible: true },
  { id: 'exchange-rates', position: 2, visible: true },
  { id: 'portfolio-overview', position: 3, visible: false },
  { id: 'notifications', position: 4, visible: true },
];