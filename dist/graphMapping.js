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
export const NodeLabel = {
    Entity: 'Entity',
    PublicBody: 'PublicBody',
    Sanction: 'Sanction',
    Jurisdiction: 'Jurisdiction',
};
export const RelationshipType = {
    /** (:Entity)-[:ISSUED_SANCTION]->(:Sanction) = the challenged/targeted side; (:PublicBody)-[:ISSUED_SANCTION]->(:Sanction) = the issuing tribunal side -- source node's label is the sole role disambiguator, per labels.ts's documented convention. */
    ISSUED_SANCTION: 'ISSUED_SANCTION',
    OPERATES_IN: 'OPERATES_IN',
};
/**
 * Best-effort deterministic MERGE key for an :Entity node -- lowercase,
 * trim, collapse whitespace, strip a short list of common legal-form
 * suffixes. Explicitly a heuristic (same honesty standard the real
 * entityResolution.ts documents for isLikelyIndividual/entityKey): two
 * distinct real entities that normalize to the same string WILL collide.
 */
export function normalizeEntityKey(name) {
    const LEGAL_SUFFIXES = /\b(inc|incorporated|corp|corporation|co|ltd|limited|llc|llp|plc|gmbh|ag|sa|nv|bv)\.?\s*$/gi;
    return name
        .trim()
        .toLowerCase()
        .replace(LEGAL_SUFFIXES, '')
        .replace(/[.,]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
/** Maps one UnifiedRecord from this actor into the node/edge instances described above. Pure function -- no Neo4j driver, no I/O (this actor has no direct database connection; ingestion is a downstream concern, exactly like every other actor in the fleet). */
export function mapRecordToGraph(record) {
    const jurisdictionCode = record.jurisdiction;
    const jurisdiction = { label: 'Jurisdiction', code: jurisdictionCode };
    const publicBody = {
        label: 'PublicBody',
        name: record.awarding_or_regulating_agency ?? 'Unknown regulator',
        jurisdiction: jurisdictionCode,
    };
    const sanction = {
        label: 'Sanction',
        recordId: record.record_id,
        actorId: 'actor-21-patent-ip-enforcement-monitor',
        fineUsdNormalized: record.value_usd_normalized,
        effectiveDateIso: record.effective_date_iso,
        sourceUrl: record.source_document_url ?? record.source_url,
    };
    const entities = [];
    const edges = [
        { type: RelationshipType.ISSUED_SANCTION, fromLabel: 'PublicBody', fromKey: publicBody.name, toLabel: 'Sanction', toKey: sanction.recordId },
        { type: RelationshipType.OPERATES_IN, fromLabel: 'PublicBody', fromKey: publicBody.name, toLabel: 'Jurisdiction', toKey: jurisdictionCode },
    ];
    if (record.recipient_or_defendant_name) {
        const entityKey = normalizeEntityKey(record.recipient_or_defendant_name);
        entities.push({
            label: 'Entity',
            entityKey,
            name: record.recipient_or_defendant_name,
            jurisdictionHint: jurisdictionCode,
            isLikelyIndividual: false, // patent owners/petitioners in this data are almost always organizations; no per-record signal to detect an individual name, unlike UK HSE's defendant field -- left false, not guessed true.
        });
        edges.push({ type: RelationshipType.ISSUED_SANCTION, fromLabel: 'Entity', fromKey: entityKey, toLabel: 'Sanction', toKey: sanction.recordId });
        edges.push({ type: RelationshipType.OPERATES_IN, fromLabel: 'Entity', fromKey: entityKey, toLabel: 'Jurisdiction', toKey: jurisdictionCode });
    }
    return { entities, publicBodies: [publicBody], sanction, jurisdiction, edges };
}
//# sourceMappingURL=graphMapping.js.map