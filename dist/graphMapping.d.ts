/**
 * Documents and implements this actor's mapping onto the fleet's real Neo4j
 * ontology (services/knowledge-graph-engine/src/ontology/labels.ts), which
 * this package cannot import directly (self-contained under
 * src/actors/actor-21/, per the task boundary) so its node/relationship
 * *shape* is re-declared locally, matching that file exactly.
 *
 * ---------------------------------------------------------------------------
 * MAPPING DECISION (read this before changing anything below)
 * ---------------------------------------------------------------------------
 * The real ontology's node labels are exactly: Entity, PublicBody, Contract,
 * Sanction, Jurisdiction, Official. There is no "Patent" or "IP dispute"
 * label -- inventing one would silently fork the ontology every downstream
 * ingestion/GraphRAG consumer relies on.
 *
 * This actor models a patent-dispute/enforcement action (a PTAB IPR/PGR/
 * CBM/DER proceeding, or an EPO opposition-family legal event) AS A
 * :Sanction NODE. This is the most defensible fit for three reasons:
 *
 *  1. The ontology's own SanctionNodeProps doc comment describes Sanction
 *     as covering "enforcement records" in general (its one existing
 *     real-world source, uk-hse-enforcement-monitor, uses it for HSE
 *     prosecutions/notices -- also an administrative/tribunal enforcement
 *     action, not a court judgment either). A PTAB trial or an EPO
 *     opposition is the patent-law equivalent: a regulator-adjacent
 *     tribunal (PTAB / EPO's Opposition Division) adjudicating a challenge
 *     against a title someone holds -- structurally the same shape as "a
 *     regulator issues an enforcement action against a party," just with a
 *     patent instead of a workplace-safety breach as the subject.
 *  2. The two-sided AWARDED_CONTRACT/ISSUED_SANCTION pattern documented in
 *     labels.ts (source node's LABEL disambiguates role, not the edge name)
 *     transfers cleanly: (:PublicBody)-[:ISSUED_SANCTION]->(:Sanction) for
 *     the issuing tribunal, (:Entity)-[:ISSUED_SANCTION]->(:Sanction) for
 *     the targeted/challenged party -- no new relationship type needed.
 *  3. Sanction's actual property set (recordId, actorId, fineUsdNormalized,
 *     effectiveDateIso, sourceUrl) already matches this actor's UMS output
 *     almost exactly modulo the name (fineUsdNormalized is always null
 *     here, since neither PTAB nor OPS carries a monetary amount -- exactly
 *     as legitimate a null as an HSE notice with no fine yet). No property
 *     had to be invented to make the fit work.
 *
 * The patent holder (PTAB patentOwnerName / the EP publication's owner) and
 * the challenger (PTAB petitioner) both become :Entity nodes. The issuing
 * body (PTAB itself, or the EPO's Opposition/Appeal division) becomes a
 * :PublicBody node scoped to jurisdiction "US" or "EP". No new node label,
 * no new relationship type, no new required property was added to the real
 * ontology to make this actor's output fit -- this file only ever produces
 * instances of the six labels already defined in labels.ts.
 * ---------------------------------------------------------------------------
 */
import type { UnifiedRecord } from './schemas.js';
export declare const NodeLabel: {
    readonly Entity: "Entity";
    readonly PublicBody: "PublicBody";
    readonly Sanction: "Sanction";
    readonly Jurisdiction: "Jurisdiction";
};
export type NodeLabel = (typeof NodeLabel)[keyof typeof NodeLabel];
export declare const RelationshipType: {
    /** (:Entity)-[:ISSUED_SANCTION]->(:Sanction) = the challenged/targeted side; (:PublicBody)-[:ISSUED_SANCTION]->(:Sanction) = the issuing tribunal side -- source node's label is the sole role disambiguator, per labels.ts's documented convention. */
    readonly ISSUED_SANCTION: "ISSUED_SANCTION";
    readonly OPERATES_IN: "OPERATES_IN";
};
export type RelationshipType = (typeof RelationshipType)[keyof typeof RelationshipType];
/**
 * Best-effort deterministic MERGE key for an :Entity node -- lowercase,
 * trim, collapse whitespace, strip a short list of common legal-form
 * suffixes. Explicitly a heuristic (same honesty standard the real
 * entityResolution.ts documents for isLikelyIndividual/entityKey): two
 * distinct real entities that normalize to the same string WILL collide.
 */
export declare function normalizeEntityKey(name: string): string;
export interface EntityNode {
    label: 'Entity';
    entityKey: string;
    name: string;
    jurisdictionHint: string | null;
    isLikelyIndividual: boolean;
}
export interface PublicBodyNode {
    label: 'PublicBody';
    name: string;
    jurisdiction: string;
}
export interface SanctionNode {
    label: 'Sanction';
    recordId: string;
    actorId: 'actor-21-patent-ip-enforcement-monitor';
    fineUsdNormalized: number | null;
    effectiveDateIso: string | null;
    sourceUrl: string | null;
}
export interface JurisdictionNode {
    label: 'Jurisdiction';
    code: string;
}
export interface GraphEdge {
    type: RelationshipType;
    fromLabel: NodeLabel;
    fromKey: string;
    toLabel: 'Sanction' | 'Jurisdiction';
    toKey: string;
}
export interface GraphMappingResult {
    entities: EntityNode[];
    publicBodies: PublicBodyNode[];
    sanction: SanctionNode;
    jurisdiction: JurisdictionNode;
    edges: GraphEdge[];
}
/** Maps one UnifiedRecord from this actor into the node/edge instances described above. Pure function -- no Neo4j driver, no I/O (this actor has no direct database connection; ingestion is a downstream concern, exactly like every other actor in the fleet). */
export declare function mapRecordToGraph(record: UnifiedRecord): GraphMappingResult;
//# sourceMappingURL=graphMapping.d.ts.map