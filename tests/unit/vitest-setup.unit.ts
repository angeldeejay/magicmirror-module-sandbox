/**
 * Unit-suite environment adjustments.
 *
 * Silence the synced MagicMirror core logger during unit runs so helper-compat
 * tests do not leak terminal noise through the core's console patching.
 */

process.env.mmTestMode = "true";
