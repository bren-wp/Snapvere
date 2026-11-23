// Snapvere by Brendigo
// Build-time edition, not a user-editable preference. No activation system is
// claimed: commercial entitlement checks require a separately audited backend.
const env = (import.meta as ImportMeta & { readonly env?: { readonly VITE_SNAPVERE_EDITION?: string } }).env;
export const IS_PRO = env?.VITE_SNAPVERE_EDITION === "pro";
export const APP_NAME = IS_PRO ? "Snapvere Pro" : "Snapvere";
