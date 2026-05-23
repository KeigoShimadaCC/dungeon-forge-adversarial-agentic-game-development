/** Stable game engine / harness protocol version for extension compatibility checks. */
export const ENGINE_PROTOCOL_VERSION = '1' as const;

/** Stable trace/scorecard/review artifact schema version for extension compatibility checks. */
export const ARTIFACT_SCHEMA_VERSION = '1' as const;

export type EngineProtocolVersion = typeof ENGINE_PROTOCOL_VERSION;
export type ArtifactSchemaVersion = typeof ARTIFACT_SCHEMA_VERSION;
