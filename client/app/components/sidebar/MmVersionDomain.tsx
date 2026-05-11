/**
 * Sidebar domain for MagicMirror core version management.
 * Displays active version, capability flags, and controls for switching versions.
 */

import type { JSX } from "preact";
import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import semver from "semver";
import type { MmCapabilities, MmVersionInfo, MmVersionState } from "../../types";

type FetchedVersionState = {
	active: string | null;
	versions: MmVersionInfo[];
	usingBuiltIn: boolean;
	builtInVersion: string | null;
};

type GhRelease = { tag_name: string; prerelease: boolean };

const EXPRESS_LABEL: Record<string, string> = {
	"4": "Express 4",
	"5": "Express 5",
	unknown: "Express ?"
};

const DEFAULTS_DIR_LABEL: Record<string, string> = {
	"/modules/default": "/modules/default",
	"/defaultmodules": "/defaultmodules",
	unknown: "unknown"
};

type CapRow = {
	key: keyof MmCapabilities;
	label: string;
	mode: "bool" | "value";
	trueClass?: "ok" | "warn";
};

const CAP_ROWS: CapRow[] = [
	{ key: "es6NodeHelper", label: "ES6 class node_helper", mode: "bool", trueClass: "warn" },
	{ key: "helperLoadedHook", label: "loaded() hook", mode: "bool", trueClass: "ok" },
	{ key: "helperStopHook", label: "stop() hook", mode: "bool", trueClass: "ok" },
	{ key: "classExtendSystem", label: "class extend system", mode: "bool", trueClass: "ok" },
	{ key: "httpFetcher", label: "HttpFetcher", mode: "bool", trueClass: "ok" },
	{ key: "corsProxy", label: "CORS proxy", mode: "bool", trueClass: "ok" },
	{ key: "corsProxyEnabledByDefault", label: "CORS on by default", mode: "bool", trueClass: "ok" },
	{ key: "getUserAgent", label: "getUserAgent()", mode: "bool", trueClass: "ok" },
	{ key: "secretPlaceholder", label: "secret placeholder", mode: "bool", trueClass: "ok" },
	{ key: "hideConfigSecrets", label: "hideConfigSecrets", mode: "bool", trueClass: "ok" },
	{ key: "configFunctions", label: "config functions", mode: "bool", trueClass: "ok" },
	{ key: "expressVersion", label: "Express", mode: "value" },
	{ key: "defaultModulesDir", label: "defaults dir", mode: "value" },
	{ key: "configLoading", label: "config loading", mode: "value" },
	{ key: "socketNamespace", label: "socket namespace", mode: "value" }
];

type CapEntryProps = { row: CapRow; caps: MmCapabilities };

function CapEntry({ row, caps }: CapEntryProps) {
	const val = caps[row.key];

	let dd: JSX.Element;
	if (row.mode === "bool") {
		const on = val === true;
		const cls = on
			? row.trueClass === "warn"
				? "mmv-cap-val mmv-cap-val--warn"
				: "mmv-cap-val mmv-cap-val--ok"
			: "mmv-cap-val mmv-cap-val--off";
		dd = (
			<dd class={cls}>
				<i class={`fa-solid ${on ? "fa-check" : "fa-xmark"}`} aria-hidden="true" />
			</dd>
		);
	} else {
		const strVal = String(val);
		const displayVal =
			row.key === "expressVersion"
				? EXPRESS_LABEL[strVal] ?? strVal
				: row.key === "defaultModulesDir"
					? DEFAULTS_DIR_LABEL[strVal] ?? strVal
					: strVal;
		const isUnknown = strVal === "unknown";
		dd = (
			<dd class={isUnknown ? "mmv-cap-val mmv-cap-val--off" : "mmv-cap-val mmv-cap-val--info"}>
				<code class="mmv-cap-val__code">{displayVal}</code>
			</dd>
		);
	}

	return (
		<>
			<dt class="mmv-cap-dt">{row.label}</dt>
			{dd}
		</>
	);
}

type VersionRowProps = {
	info: MmVersionInfo;
	isActive: boolean;
	onActivate: (key: string) => void;
	onRedownload: (key: string) => void;
	onDelete: (key: string) => void;
	redownloading: boolean;
	deleting: boolean;
};

function VersionRow({ info, isActive, onActivate, onRedownload, onDelete, redownloading, deleting }: VersionRowProps) {
	const isBleedingEdge = info.key === "develop";
	const keyLabel = isBleedingEdge ? "bleeding-edge" : info.key;

	return (
		<div class={`mmv-version-row${isActive ? " mmv-version-row--active" : ""}`}>
			<span class="mmv-version-row__key">
				{isActive && (
					<i class="fa-solid fa-circle-dot mmv-version-row__active-dot" aria-hidden="true" />
				)}
				{keyLabel}
			</span>
			{info.displayVersion && info.displayVersion !== info.key && (
				<span class="mmv-version-row__display">
					{info.displayVersion.replace(/-develop$/i, "")}
				</span>
			)}
			<span class={`mmv-version-row__shims ${info.shimsBuilt ? "mmv-version-row__shims--ok" : "mmv-version-row__shims--pending"}`}>
				{info.shimsBuilt ? "shims ✓" : "shims pending"}
			</span>
			<div class="mmv-version-row__actions">
				{!isActive && (
					<button
						class="sandbox-button mmv-version-row__action-btn"
						type="button"
						title="Activate"
						onClick={() => onActivate(info.key)}
					>
						<i class="fa-solid fa-bolt fa-fw" aria-hidden="true" />
					</button>
				)}
				<button
					class="sandbox-button mmv-version-row__action-btn"
					type="button"
					disabled={redownloading || deleting}
					title={isBleedingEdge ? "Re-download latest develop build" : "Delete cache and re-download"}
					onClick={() => onRedownload(info.key)}
				>
					{redownloading ? (
						<i class="fa-solid fa-spinner fa-spin fa-fw" aria-hidden="true" />
					) : (
						<i class="fa-solid fa-arrows-rotate fa-fw" aria-hidden="true" />
					)}
				</button>
				{!isActive && (
					<button
						class="sandbox-button mmv-version-row__action-btn mmv-version-row__action-btn--danger"
						type="button"
						disabled={deleting || redownloading}
						title="Delete cached version"
						onClick={() => onDelete(info.key)}
					>
						{deleting ? (
							<i class="fa-solid fa-spinner fa-spin fa-fw" aria-hidden="true" />
						) : (
							<i class="fa-solid fa-trash fa-fw" aria-hidden="true" />
						)}
					</button>
				)}
			</div>
		</div>
	);
}

const MIN_SUPPORTED_VERSION = "2.35.0";

function isSupportedVersion(v: string): boolean {
	const clean = semver.clean(v);
	return clean !== null && semver.gte(clean, MIN_SUPPORTED_VERSION);
}

export function MmVersionDomain() {
	const [state, setState] = useState<FetchedVersionState>({
		active: null,
		versions: [],
		usingBuiltIn: true,
		builtInVersion: null
	});
	const [caps, setCaps] = useState<MmCapabilities | null>(null);
	const [selectedVersion, setSelectedVersion] = useState("");
	const [releases, setReleases] = useState<string[]>([]);
	const [releasesLoading, setReleasesLoading] = useState(false);
	const [releasesError, setReleasesError] = useState(false);
	const [activating, setActivating] = useState(false);
	const [redownloading, setRedownloading] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [resetting, setResetting] = useState(false);
	const releasesFetchStartedRef = useRef(false);

	const loadVersions = useCallback(() => {
		fetch("/__harness/mm-versions", { cache: "no-store" })
			.then((r) => r.json())
			.then((data: FetchedVersionState & { capabilities?: MmCapabilities }) => {
				setState({
					active: data.active ?? null,
					versions: Array.isArray(data.versions) ? data.versions : [],
					usingBuiltIn: data.usingBuiltIn ?? true,
					builtInVersion: data.builtInVersion ?? null
				});
				if (data.capabilities) {
					setCaps(data.capabilities);
				} else if (data.active && Array.isArray(data.versions)) {
					const activeInfo = data.versions.find((v) => v.key === data.active);
					if (activeInfo) setCaps(activeInfo.capabilities);
				} else if (data.usingBuiltIn && data.builtInVersion && Array.isArray(data.versions)) {
					const builtInInfo = data.versions.find(
						(v) => v.displayVersion === data.builtInVersion || v.key === data.builtInVersion
					);
					if (builtInInfo) setCaps(builtInInfo.capabilities);
				}
			})
			.catch(() => {});
	}, []);

	const loadReleases = useCallback(() => {
		if (releasesFetchStartedRef.current) return;
		releasesFetchStartedRef.current = true;
		setReleasesLoading(true);
		setReleasesError(false);
		fetch("https://api.github.com/repos/MagicMirrorOrg/MagicMirror/releases?per_page=50")
			.then((r) => r.json())
			.then((data: GhRelease[]) => {
				const tags = data
					.filter((r) => !r.prerelease)
					.map((r) => r.tag_name.replace(/^v/, ""))
					.filter(isSupportedVersion);
				setReleases(tags);
				if (tags.length > 0) {
					setSelectedVersion((prev) => prev || tags[0]);
				}
			})
			.catch(() => {
				releasesFetchStartedRef.current = false;
				setReleasesError(true);
			})
			.finally(() => {
				setReleasesLoading(false);
			});
	}, []);

	useEffect(() => {
		loadVersions();
		loadReleases();

		function onVersionChanged(e: Event) {
			const ev = e as CustomEvent<MmVersionState>;
			const detail = ev.detail;
			if (!detail) return;
			setState((prev) => ({
				active: detail.active,
				versions: Array.isArray(detail.versions) ? detail.versions : prev.versions,
				usingBuiltIn: detail.usingBuiltIn,
				builtInVersion: prev.builtInVersion
			}));
			if (detail.capabilities) setCaps(detail.capabilities);
			else setCaps(null);
		}

		window.addEventListener("module-sandbox:mm-version-changed", onVersionChanged);
		return () => {
			window.removeEventListener("module-sandbox:mm-version-changed", onVersionChanged);
		};
	}, [loadVersions, loadReleases]);

	const handleActivate = useCallback(
		(version: string) => {
			if (!version.trim() || activating) return;
			setActivating(true);
			setError(null);
			fetch("/__harness/mm-versions/activate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ version: version.trim() })
			})
				.then((r) => r.json())
				.then((data: { ok?: boolean; error?: string; capabilities?: MmCapabilities }) => {
					if (!data.ok) {
						setError(data.error ?? "Activation failed.");
					} else {
						if (data.capabilities) setCaps(data.capabilities);
						loadVersions();
					}
				})
				.catch((err: Error) => {
					setError(err.message ?? "Network error.");
				})
				.finally(() => {
					setActivating(false);
				});
		},
		[activating, loadVersions]
	);

	const handleRedownload = useCallback(
		(versionKey: string) => {
			if (redownloading) return;
			setRedownloading(versionKey);
			setError(null);
			fetch("/__harness/mm-versions/redownload", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ version: versionKey })
			})
				.then((r) => r.json())
				.then((data: { ok?: boolean; error?: string; capabilities?: MmCapabilities }) => {
					if (!data.ok) {
						setError(data.error ?? "Re-download failed.");
					} else {
						if (data.capabilities) setCaps(data.capabilities);
						loadVersions();
					}
				})
				.catch((err: Error) => {
					setError(err.message ?? "Network error.");
				})
				.finally(() => {
					setRedownloading(null);
				});
		},
		[redownloading, loadVersions]
	);

	const handleDelete = useCallback(
		(versionKey: string) => {
			if (deleting) return;
			setDeleting(versionKey);
			setError(null);
			fetch("/__harness/mm-versions/delete-cache", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ version: versionKey })
			})
				.then((r) => r.json())
				.then((data: { ok?: boolean; error?: string }) => {
					if (!data.ok) {
						setError(data.error ?? "Delete failed.");
					} else {
						loadVersions();
					}
				})
				.catch((err: Error) => {
					setError(err.message ?? "Network error.");
				})
				.finally(() => {
					setDeleting(null);
				});
		},
		[deleting, loadVersions]
	);

	const handleReset = useCallback(() => {
		if (resetting) return;
		setResetting(true);
		setError(null);
		fetch("/__harness/mm-versions/active", { method: "DELETE" })
			.then((r) => r.json())
			.then((data: { ok?: boolean; error?: string }) => {
				if (!data.ok) setError(data.error ?? "Reset failed.");
				else {
					setCaps(null);
					loadVersions();
				}
			})
			.catch((err: Error) => {
				setError(err.message ?? "Network error.");
			})
			.finally(() => {
				setResetting(false);
			});
	}, [resetting, loadVersions]);

	const activeInfo = state.active
		? state.versions.find((v) => v.key === state.active)
		: null;
	const displayActive = state.usingBuiltIn
		? (state.builtInVersion ?? "—")
		: (activeInfo?.displayVersion?.replace(/-develop$/i, "") ?? state.active ?? "—");

	const sortedReleases = [...releases].sort((a, b) => {
		const ca = semver.clean(a), cb = semver.clean(b);
		if (!ca || !cb) return 0;
		return semver.rcompare(ca, cb);
	});
	const effectiveSelected = selectedVersion || sortedReleases[0] || "develop";
	const isBuiltInSelected = !!state.builtInVersion && effectiveSelected === state.builtInVersion;

	return (
		<section
			id="domain-mmversion"
			class="sandbox-domain"
			data-domain="mmversion"
			data-active="false"
		>
			<span class="status-pill">
				MagicMirror core version manager. Switch the active MM core and inspect
				capability flags per version.
			</span>

			<div class="sandbox-section-title">Active core</div>
			<div class="mmv-input-row">
				<input
					class="sandbox-input mmv-version-input"
					type="text"
					readOnly
					value={displayActive}
				/>
				<button
					class="sandbox-button mmv-activate-btn"
					type="button"
					disabled={state.usingBuiltIn || resetting}
					title={state.usingBuiltIn ? "Already using built-in shims" : "Reset to built-in shims"}
					onClick={handleReset}
				>
					{resetting ? (
						<><i class="fa-solid fa-spinner fa-spin" aria-hidden="true" />Resetting…</>
					) : (
						<><i class="fa-solid fa-rotate-left" aria-hidden="true" />Reset</>
					)}
				</button>
			</div>

			<div class="sandbox-section-title">Capabilities</div>
			{caps
				? (
					<dl class="mmv-cap-list">
						{CAP_ROWS.map((row) => (
							<CapEntry key={row.key} row={row} caps={caps} />
						))}
					</dl>
				)
				: (
					<span class="mmv-caps-loading">
						<i class="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Loading…
					</span>
				)
			}

			<div class="sandbox-section-title">Switch version</div>
			<div class="mmv-input-row">
				<select
					class="sandbox-input mmv-version-select"
					value={effectiveSelected}
					disabled={activating || releasesLoading}
					onChange={(e) => setSelectedVersion((e.target as HTMLSelectElement).value)}
				>
					<option value="develop">bleeding-edge (develop)</option>
					{releasesLoading && (
						<option value="" disabled>Loading releases…</option>
					)}
					{releasesError && (
						<option value="" disabled>Could not load more releases</option>
					)}
					{!releasesLoading && !releasesError && sortedReleases.map((v) => (
						<option key={v} value={v}>{v}</option>
					))}
				</select>
				<button
					class="sandbox-button mmv-activate-btn"
					type="button"
					disabled={activating || !effectiveSelected || releasesLoading || releasesError}
					onClick={() => isBuiltInSelected ? handleReset() : handleActivate(effectiveSelected)}
				>
					{activating ? (
						<>
							<i class="fa-solid fa-spinner fa-spin" aria-hidden="true" />
							Activating…
						</>
					) : (
						<>
							<i class="fa-solid fa-bolt" aria-hidden="true" />
							Activate
						</>
					)}
				</button>
			</div>
			{error && (
				<div class="mmv-error" role="alert">
					<i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
					{error}
				</div>
			)}

			{(() => {
				const nonBuiltInVersions = state.builtInVersion
					? state.versions.filter(v =>
						v.key === "develop" ||
						(v.displayVersion ?? "") !== state.builtInVersion
					  )
					: state.versions;
				return nonBuiltInVersions.length > 0 ? (
					<>
						<div class="sandbox-section-title">Cached versions</div>
						<div class="mmv-version-list">
							{nonBuiltInVersions.map((info) => (
								<VersionRow
									key={info.key}
									info={info}
									isActive={info.key === state.active}
									onActivate={handleActivate}
									onRedownload={handleRedownload}
									onDelete={handleDelete}
									redownloading={redownloading === info.key}
									deleting={deleting === info.key}
								/>
							))}
						</div>
					</>
				) : null;
			})()}
		</section>
	);
}
