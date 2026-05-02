/**
 * Sidebar domain renderer for product orientation and reference links.
 */

import { GitHubMark } from "../icons/GitHubMark";

/**
 * Internal helper for about domain.
 */
export function AboutDomain() {
	return (
		<section
			id="domain-about"
			class="sandbox-domain"
			data-domain="about"
			data-active="false"
		>
			<span class="status-pill">
				Product context, credits, and identity.
			</span>
			<div class="sandbox-section-title">Product</div>
			<p>Thin runtime harness for one MagicMirror module.</p>
			<span class="status-pill">
				Supported surface is intentionally narrow but
				MagicMirror-faithful.
			</span>
			<span class="status-pill">
				Official MagicMirror references worth keeping close while
				building modules.
			</span>
			<div class="sandbox-section-title">
				<i class="fa-solid fa-book-open" aria-hidden="true" />{" "}
				MagicMirror references
			</div>
			<ul class="sandbox-hint-list">
				<li>
					<a
						href="https://docs.magicmirror.builders/"
						target="_blank"
						rel="noreferrer noopener"
					>
						MagicMirror documentation
					</a>
				</li>
				<li>
					<a
						href="https://docs.magicmirror.builders/module-development/introduction.html"
						target="_blank"
						rel="noreferrer noopener"
					>
						Module development introduction
					</a>
				</li>
				<li>
					<a
						href="https://docs.magicmirror.builders/module-development/core-module-file.html"
						target="_blank"
						rel="noreferrer noopener"
					>
						Core module file reference
					</a>
				</li>
				<li>
					<a
						href="https://docs.magicmirror.builders/module-development/node-helper.html"
						target="_blank"
						rel="noreferrer noopener"
					>
						Node helper reference
					</a>
				</li>
			</ul>
			<div class="sandbox-section-title">Credits</div>
			<ul class="sandbox-hint-list">
				<li>
					Product:{" "}
					<a
						class="harness-footer-link"
						href="https://github.com/angeldeejay/magicmirror-module-sandbox"
						target="_blank"
						rel="noreferrer noopener"
					>
						<GitHubMark />
						<span>magicmirror-module-sandbox</span>
					</a>
				</li>
				<li>
					Author:{" "}
					<a
						href="https://github.com/angeldeejay"
						target="_blank"
						rel="noreferrer noopener"
					>
						angeldeejay
					</a>
				</li>
			</ul>
		</section>
	);
}
