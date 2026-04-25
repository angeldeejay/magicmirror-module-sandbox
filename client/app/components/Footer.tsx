/**
 * Persistent shell footer with repository and author links.
 */

import { GitHubMark } from "./icons/GitHubMark";

/**
 * Internal helper for footer.
 */
export function Footer() {
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
