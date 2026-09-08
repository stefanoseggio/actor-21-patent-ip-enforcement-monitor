/**
 * MCP tool spec for this actor, following the real fleet pattern used by
 * services/mcp-gateway/src/mcp/tools/*.ts + registry.ts (zod input schema
 * -> TOOL_NAME/description/inputSchema/jsonSchema -> async handler(input,
 * ctx)) -- reproduced here rather than imported, since this actor is a
 * fresh, self-contained package under src/actors/actor-21/ and the task
 * boundary forbids editing services/mcp-gateway.
 *
 * Wiring note: the real gateway's tools call a shared QueryRouter that
 * knows how to fetch+cache Apify dataset rows across all 11 fleet actors
 * (services/mcp-gateway/src/routing/queryRouter.ts, not reachable from
 * here). This actor has no such infrastructure of its own, so its
 * ToolContext is intentionally the smallest thing that lets the same
 * handler shape be adopted by the real gateway later: a plain
 * `getRecords()` fetcher the caller supplies (in the gateway, that would be
 * QueryRouter.fetchRecords scoped to this actor's UMS output; in a
 * standalone script, it can just be `() => Actor.dataset().listItems()`
 * mapped through umsNormalizer). The filtering logic below
 * (applyPatentEnforcementFilters) is the actual reusable business logic --
 * everything else is transport plumbing.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { UnifiedRecord } from '../src/schemas.js';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const dateRangeSchema = z.object({
    start_date: z.string().date().optional(),
    end_date: z.string().date().optional(),
});

/** Mirrors services/mcp-gateway/src/schemas/common.ts's requestModeSchema -- redeclared locally, see file header. */
const requestModeSchema = z.enum(['cached', 'realtime']).default('cached');

export const searchPatentEnforcementInputSchema = z.object({
    /** Substring match against recipient_or_defendant_name (PTAB: patent owner; EPO: unset for v1 -- see umsNormalizer.ts). */
    entity_name: z.string().optional(),
    /** PTAB trial types and/or the EPO opposition-watch source, via category_or_type / awarding_or_regulating_agency. Omit for both sources. */
    trial_type_codes: z.array(z.enum(['IPR', 'PGR', 'CBM', 'DER'])).optional(),
    jurisdiction: z.array(z.enum(['US', 'EP'])).optional(),
    date_range: dateRangeSchema.optional(),
    only_new: z.coerce.boolean().default(false),
    max_results: z.coerce.number().int().min(1).max(1000).default(100),
    mode: requestModeSchema,
});

export type SearchPatentEnforcementInput = z.infer<typeof searchPatentEnforcementInputSchema>;

export const TOOL_NAME = 'search_patent_enforcement';
export const description =
    'Searches real, adversarial patent enforcement/dispute records: USPTO PTAB Inter Partes Review, Post-Grant Review, Covered Business Method, and Derivation proceedings (jurisdiction US), plus EPO opposition-family legal events for a caller-maintained EP publication watchlist (jurisdiction EP). Excludes ordinary patent grants -- every record here is an adversarial proceeding or a legal-status event against an existing patent. Both sources require the actor operator to have supplied their own registered API credential (USPTO ODP key / EPO OPS OAuth client); records are only as fresh as the underlying actor run.';
export const inputSchema = searchPatentEnforcementInputSchema;
/** Real JSON Schema derived from the single zod source above -- not hand-duplicated, same pattern as searchGovernmentTenders.ts. */
export const jsonSchema = zodToJsonSchema(searchPatentEnforcementInputSchema, TOOL_NAME);

// ---------------------------------------------------------------------------
// Filtering (the actual reusable logic)
// ---------------------------------------------------------------------------

export function applyPatentEnforcementFilters(records: UnifiedRecord[], input: SearchPatentEnforcementInput): UnifiedRecord[] {
    return records.filter((record) => {
        if (input.entity_name && !record.recipient_or_defendant_name?.toLowerCase().includes(input.entity_name.toLowerCase())) {
            return false;
        }
        if (input.trial_type_codes && input.trial_type_codes.length > 0) {
            if (!record.category_or_type || !input.trial_type_codes.includes(record.category_or_type as 'IPR' | 'PGR' | 'CBM' | 'DER')) {
                return false;
            }
        }
        if (input.jurisdiction && input.jurisdiction.length > 0 && !input.jurisdiction.includes(record.jurisdiction as 'US' | 'EP')) {
            return false;
        }
        if (input.only_new && record.is_new !== true) return false;
        if (input.date_range?.start_date && record.effective_date_iso && record.effective_date_iso < input.date_range.start_date) {
            return false;
        }
        if (input.date_range?.end_date && record.effective_date_iso && record.effective_date_iso > input.date_range.end_date) {
            return false;
        }
        return true;
    });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface ToolContext {
    /** Returns this actor's UMS-normalized records (e.g. the gateway's QueryRouter, or a direct Apify dataset read mapped through src/umsNormalizer.ts). */
    getRecords: () => Promise<UnifiedRecord[]>;
}

export interface SearchPatentEnforcementOutput {
    result_count: number;
    records: UnifiedRecord[];
}

export async function handler(input: SearchPatentEnforcementInput, ctx: ToolContext): Promise<SearchPatentEnforcementOutput> {
    const records = await ctx.getRecords();
    const filtered = applyPatentEnforcementFilters(records, input).slice(0, input.max_results);
    return {
        result_count: filtered.length,
        records: filtered,
    };
}
