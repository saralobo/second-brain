import { ulid } from '@ava/core'
import type { Database } from '../client'

export interface ChatMessage {
  id: string
  conversationId: string
  role: 'user' | 'ava'
  body: string
  decisionRecordId: string | null
  abstained: boolean
  contextHealth: string | null
  createdAt: Date
}

export interface Conversation {
  id: string
  workstreamId: string
  title: string | null
  createdAt: Date
}

export class ConversationRepository {
  constructor(private readonly db: Database) {}

  async create(workstreamId: string, title: string | null = null): Promise<Conversation> {
    const id = ulid()
    await this.db.query(
      'INSERT INTO conversation (id, workstream_id, title) VALUES ($1,$2,$3)',
      [id, workstreamId, title],
    )
    const c = await this.findById(id)
    if (!c) throw new Error('conversation did not persist')
    return c
  }

  /** The conversation a workstream's chat page continues, or a new one. */
  async ensureLatest(workstreamId: string): Promise<Conversation> {
    const res = await this.db.query(
      'SELECT * FROM conversation WHERE workstream_id = $1 ORDER BY created_at DESC LIMIT 1',
      [workstreamId],
    )
    const row = res.rows[0]
    return row ? toConversation(row) : this.create(workstreamId)
  }

  async findById(id: string): Promise<Conversation | null> {
    const res = await this.db.query('SELECT * FROM conversation WHERE id = $1', [id])
    const row = res.rows[0]
    return row ? toConversation(row) : null
  }

  async addMessage(input: {
    conversationId: string
    role: 'user' | 'ava'
    body: string
    decisionRecordId?: string | null
    abstained?: boolean
    contextHealth?: string | null
  }): Promise<string> {
    const id = ulid()
    await this.db.query(
      `INSERT INTO chat_message (id, conversation_id, role, body, decision_record_id, abstained, context_health)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id, input.conversationId, input.role, input.body,
        input.decisionRecordId ?? null, input.abstained ?? false, input.contextHealth ?? null,
      ],
    )
    return id
  }

  async messages(conversationId: string, limit = 50): Promise<ChatMessage[]> {
    const res = await this.db.query(
      'SELECT * FROM chat_message WHERE conversation_id = $1 ORDER BY created_at, id LIMIT $2',
      [conversationId, limit],
    )
    return res.rows.map((r) => ({
      id: String(r.id),
      conversationId: String(r.conversation_id),
      role: r.role as 'user' | 'ava',
      body: String(r.body),
      decisionRecordId: r.decision_record_id ? String(r.decision_record_id) : null,
      abstained: Boolean(r.abstained),
      contextHealth: r.context_health ? String(r.context_health) : null,
      createdAt: new Date(r.created_at as string),
    }))
  }
}

function toConversation(r: Record<string, unknown>): Conversation {
  return {
    id: String(r.id),
    workstreamId: String(r.workstream_id),
    title: r.title ? String(r.title) : null,
    createdAt: new Date(r.created_at as string),
  }
}
