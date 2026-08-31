import { describe, expect, it } from 'vitest'
import { withTestContext } from '@ava/test-support'
import { capture } from '@ava/app'
import { buildContextPacket } from '@ava/retrieval'

/**
 * Context Packet assembly against a real store.
 *
 * These assert on the packet as an OBJECT — what it contains, what it
 * excludes, and why. That is the whole reason the packet is not a prompt
 * string: exclusions are the part most likely to be wrong, and a string
 * cannot be inspected for what is missing from it.
 */
describe('context packet', () => {
  it('carries retrieval, state, changes, health and exclusions', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Packet', null)
      await capture(ctx, {
        workstreamId: ws.id, type: 'decision',
        title: 'Adopt weekly releases', content: 'Releases move to a weekly cadence.',
      })

      const { packet, candidateCount, strategy } = await buildContextPacket(
        {
          retrieval: ctx.retrieval, state: ctx.state, changes: ctx.changes,
          cognition: ctx.cognition, hypotheses: ctx.hypotheses, memory: ctx.memory,
          evidence: ctx.evidence,
        },
        { question: 'What do you know about releases?', workstreamId: ws.id },
      )

      expect(strategy).toBe('lexical/fts/1')
      expect(candidateCount).toBeGreaterThan(0)
      expect(packet.query.kind).toBe('state')
      expect(packet.currentState).toHaveLength(1)
      expect(packet.changes.length).toBeGreaterThan(0)
      expect(packet.health.dimensions).toHaveLength(11)
      expect(packet.providerEligibleEvidenceIds.length).toBeGreaterThan(0)

      // Nothing was declared in this workstream, so the cognition sections are
      // empty — which is the honest value, not a placeholder.
      expect(packet.declaredCognition).toEqual([])
      expect(packet.behavioralHypotheses).toEqual([])
      expect(packet.stabilizedKnowledge).toEqual([])

      // Every result carries what an auditor needs.
      const r = packet.retrieved[0]!
      expect(r.evidenceId).toBeTruthy()
      expect(r.sourceRecordId).toBeTruthy()
      expect(r.contentOrigin).toBe('user')
      expect(r.strength).toBe('ESTABLISHED')
      expect(r.sensitivity).toBe('normal')
      expect(r.observedAt).toBeInstanceOf(Date)
      expect(r.reason).toContain('lexical match')
      // Rank is a match score, never a probability of truth.
      expect(typeof r.score).toBe('number')
    })
  })

  it('scopes retrieval to one workstream', async () => {
    await withTestContext(async (ctx) => {
      const mine = await ctx.workstreams.create('Mine', null)
      const other = await ctx.workstreams.create('Other', null)
      await capture(ctx, {
        workstreamId: other.id, type: 'note',
        title: 'Other project', content: 'The pricing model for the other project is usage-based.',
      })

      const { packet } = await buildContextPacket(
        {
          retrieval: ctx.retrieval, state: ctx.state, changes: ctx.changes,
          cognition: ctx.cognition, hypotheses: ctx.hypotheses, memory: ctx.memory,
          evidence: ctx.evidence,
        },
        { question: 'What do you know about the pricing model?', workstreamId: mine.id },
      )

      // No leakage across projects, even though the words match perfectly.
      expect(packet.retrieved).toHaveLength(0)
      expect(packet.health.state).toBe('INSUFFICIENT')
    })
  })

  it('caps how much may reach the provider and says what it dropped', async () => {
    await withTestContext(async (ctx) => {
      const ws = await ctx.workstreams.create('Many', null)
      for (let i = 0; i < 5; i += 1) {
        await capture(ctx, {
          workstreamId: ws.id, type: 'note',
          title: `Latency note ${i}`, content: `Latency observation number ${i} for the search path.`,
        })
      }

      const { packet } = await buildContextPacket(
        {
          retrieval: ctx.retrieval, state: ctx.state, changes: ctx.changes,
          cognition: ctx.cognition, hypotheses: ctx.hypotheses, memory: ctx.memory,
          evidence: ctx.evidence,
        },
        { question: 'What do you know about latency?', workstreamId: ws.id, maxProviderItems: 2 },
      )

      expect(packet.retrieved.length).toBe(5)
      expect(packet.providerEligibleEvidenceIds).toHaveLength(2)
      const dropped = packet.exclusions.filter((e) => e.reason === 'below_selection_limit')
      expect(dropped).toHaveLength(3)
      // Capping is not a gap in knowledge — the rest still answers the question.
      expect(packet.health.state).toBe('HEALTHY')
    })
  })
})
