/**
 * Application error classes with explicit HTTP status codes for sandbox routes.
 */

/**
 * Thrown when a request payload fails validation. Maps to HTTP 400.
 */
export class ValidationError extends Error {
	readonly statusCode = 400;

	constructor(message: string) {
		super(message);
		this.name = "ValidationError";
	}
}
