/**
 * Persistent shell footer with repository and author links.
 */

import type { HarnessState } from "../harness-state";
import { GitHubMark } from "./icons/GitHubMark";

type FooterProps = {
	harness: HarnessState;
};

/**
 * Internal helper for footer.
 */
export function Footer({ harness }: FooterProps) {
	return (
		<footer class="harness-footer">
			<div class="harness-footer-copy">
				<a
					class="harness-footer-link"
					href="https://github.com/angeldeejay/magicmirror-module-sandbox"
					target="_blank"
					rel="noreferrer noopener"
				>
					<GitHubMark />
					<span>magicmirror-module-sandbox</span>
				</a>
				{harness.sandboxVersion && (
					<>
						<span class="harness-footer-divider" aria-hidden="true" />
						<span class="harness-footer-version">v{harness.sandboxVersion}</span>
					</>
				)}
			</div>
			<div class="harness-footer-center">
				{harness.mmVersion && (
					<a
						class="harness-footer-mm-link"
						href="https://github.com/MagicMirrorOrg/MagicMirror"
						target="_blank"
						rel="noreferrer noopener"
					>
						MagicMirror
					</a>
				)}
				{harness.mmVersion && (
					<span class="harness-footer-mm-version">v{harness.mmVersion}</span>
				)}
			</div>
			<div class="harness-footer-credits">
				Author:{" "}
				<a
					href="https://github.com/angeldeejay"
					target="_blank"
					rel="noreferrer noopener"
				>
					angeldeejay
				</a>
			</div>
		</footer>
	);
}
