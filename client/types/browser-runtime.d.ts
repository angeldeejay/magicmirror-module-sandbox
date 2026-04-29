/**
 * Browser-global type declarations shared by the sandbox runtime modules.
 */

declare global {
	interface SandboxCore {
		harness: Record<string, unknown>;
		[key: string]: any;
	}

	interface EditorHostElement extends HTMLElement {
		raw_string: string;
		lastValidationError?: string;
		lastFormattedString?: string;
		validation_error: string;
		is_valid(): boolean;
		json_value: any;
		value: string;
	}

	interface Window {
		__HARNESS__?: Record<string, unknown>;
		__MICROCORE__?: SandboxCore;
		MM?: any;
		Module?: any;
		Log?: any;
		Translator?: any;
		__moduleSandboxModule?: any;
		__MODULE_SANDBOX_CONSOLE_CAPTURED__?: boolean;
		mmVersion?: string;
		translations?: Record<string, any>;
		config?: Record<string, any> & {
			basePath?: string;
		};
		io?: (...args: unknown[]) => any;
		nunjucks?: any;
	}

	interface GlobalThis {
		__MICROCORE__?: SandboxCore;
		MM?: any;
		Module?: any;
		Log?: any;
		Translator?: any;
		translations?: Record<string, any>;
		nunjucks?: any;
	}

	const io: (...args: unknown[]) => any;
	const Module: any;
	const Log: any;
	const nunjucks: any;
}

export {};
