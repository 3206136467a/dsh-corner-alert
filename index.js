/**
 * Host half of `dsh-corner-alert`.
 *
 * The feature lives in the browser half (`./client`): it watches the session
 * status projection for turn completions and pending interactions, then raises
 * a bottom-right toast and a notification sound. This entry exists so the
 * package is an ordinary Loader row whose manifest the client-module scanner
 * can read.
 *
 * @module dsh-corner-alert
 */

/** Loader-visible no-op body; the browser half carries the feature. */
export function apply() {}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-corner-alert';
