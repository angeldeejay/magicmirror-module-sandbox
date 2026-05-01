/**
 * Shared types and Zod schemas for the module quality analysis pipeline.
 */

import { z } from "zod";

export type AnalysisSeverity = "error" | "warning" | "info";

export interface AnalysisFinding {
	id: string;
	category: string;
	severity: AnalysisSeverity;
	description: string;
	file: string | null;
}

export interface ModuleAnalysisResult {
	moduleName: string;
	moduleRoot: string;
	analyzedAt: number;
	durationMs: number;
	moduleUrl: string | null;
	findings: AnalysisFinding[];
	findingCounts: {
		total: number;
		errors: number;
		warnings: number;
		info: number;
	};
	error: string | null;
}

export const analysisFindingSchema = z.object({
	id: z.string(),
	category: z.string(),
	severity: z.enum(["error", "warning", "info"]),
	description: z.string(),
	file: z.string().nullable()
});

export const moduleAnalysisResultSchema = z.object({
	moduleName: z.string(),
	moduleRoot: z.string(),
	analyzedAt: z.number(),
	durationMs: z.number(),
	moduleUrl: z.string().nullable(),
	findings: z.array(analysisFindingSchema),
	findingCounts: z.object({
		total: z.number(),
		errors: z.number(),
		warnings: z.number(),
		info: z.number()
	}),
	error: z.string().nullable()
});
