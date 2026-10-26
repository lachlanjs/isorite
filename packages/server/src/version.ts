// The version: written into the bundle when it is built for npm (scripts/package.ts), else this checkout's.
declare const ISORITE_VERSION: string | undefined;
export const VERSION = typeof ISORITE_VERSION === "string" ? ISORITE_VERSION : "0.1.0 (checkout)";
