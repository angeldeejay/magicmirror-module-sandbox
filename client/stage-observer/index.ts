/**
 * Browser observer injected into the real MagicMirror core page served at
 * `/__stage/`. It loads as one classic script before any core script, so it
 * works for the classic (2.35-2.36), hybrid (2.37) and ESM (2.38+) cores.
 *
 * For now it only marks the document as a real-core stage; the observation
 * hooks land on top of this entry.
 */

document.documentElement.dataset.sandboxStage = "core";
