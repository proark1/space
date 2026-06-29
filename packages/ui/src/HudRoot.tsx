/**
 * Root of the React HUD overlay (T33 fills this in with the throttled, store-fed live HUD:
 * health / battery / ammo / objective / Resolve, re-rendering only on slice changes via
 * useShallow). M1-A0 scaffold: a mountable placeholder so the package + bootstrap compile.
 */
export function HudRoot() {
  return <div className="sl-hud" data-testid="sl-hud" />;
}
