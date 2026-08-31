import {
  ChangeRepository, ContextHealthRepository, ConversationRepository,
  DecisionRecordRepository, EvidenceRepository, ModelRunRepository, RetrievalRepository,
  SourceRepository, StateRepository, WorkstreamRepository,
  migrate, openDatabase, openTestDatabase,
} from '@ava/db'
import type { Database } from '@ava/db'
import { TelemetryWriter } from '@ava/telemetry'

/**
 * Application context: the composition root.
 *
 * Repositories and the telemetry writer are assembled here so that use cases
 * stay free of construction details and the web layer stays free of domain
 * logic.
 */
export interface AppContext {
  db: Database
  workstreams: WorkstreamRepository
  evidence: EvidenceRepository
  sources: SourceRepository
  state: StateRepository
  changes: ChangeRepository
  modelRuns: ModelRunRepository
  retrieval: RetrievalRepository
  decisionRecords: DecisionRecordRepository
  contextHealth: ContextHealthRepository
  conversations: ConversationRepository
  telemetry: TelemetryWriter
}

export function buildContext(db: Database): AppContext {
  return {
    db,
    workstreams: new WorkstreamRepository(db),
    evidence: new EvidenceRepository(db),
    sources: new SourceRepository(db),
    state: new StateRepository(db),
    changes: new ChangeRepository(db),
    modelRuns: new ModelRunRepository(db),
    retrieval: new RetrievalRepository(db),
    decisionRecords: new DecisionRecordRepository(db),
    contextHealth: new ContextHealthRepository(db),
    conversations: new ConversationRepository(db),
    telemetry: new TelemetryWriter(db),
  }
}

let shared: Promise<AppContext> | null = null

/** Long-lived context for the running application. */
export function getContext(): Promise<AppContext> {
  if (shared === null) {
    shared = (async () => {
      const db = await openDatabase()
      await migrate(db)
      return buildContext(db)
    })()
  }
  return shared
}

/** Fresh in-memory context for tests. Never touches the developer data dir. */
export async function createTestContext(): Promise<AppContext> {
  const db = await openTestDatabase()
  await migrate(db)
  return buildContext(db)
}
