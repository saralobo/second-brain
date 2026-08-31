import { getContext } from '../context'
import {
  correctFeedback, interventionHistory, recordFeedback, recordOutcome, recordUserAction,
  resolveOutcome,
} from '../feedback-service'
import { interventionMetrics } from '../metrics-service'
import type {
  ArtifactVerdict, DeliveryVerdict, EpistemicVerdict, OutcomeState, UserActionKind,
} from '@ava/core'

/**
 * Feedback, actions and outcomes from the command line.
 *
 *   npm run feedback -- give <opportunityId> [epistemic] [delivery] [artifact]
 *   npm run feedback -- correct <feedbackId> [epistemic] [delivery]
 *   npm run feedback -- action <opportunityId> <kind> [description]
 *   npm run feedback -- outcome <opportunityId> <state> [note]
 *   npm run feedback -- history <opportunityId>
 *   npm run feedback -- metrics <workstreamId>
 *
 * Pass `-` for a dimension you do not want to answer. Nothing here reaches a
 * provider: feedback notes are private commentary and stay on this machine.
 */
const blank = (v: string | undefined): string | null =>
  v === undefined || v === '-' || v === '' ? null : v

async function main(): Promise<void> {
  const ctx = await getContext()
  try {
    await run(ctx)
  } finally {
    // Close the writer explicitly. PGlite keeps the process alive otherwise,
    // and a CLI that never exits looks identical to one that hung.
    await ctx.db.close()
  }
}

async function run(ctx: Awaited<ReturnType<typeof getContext>>): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)

  if (command === 'give') {
    const [targetId, epistemic, delivery, artifact] = rest
    if (!targetId) return usage()
    const row = await recordFeedback(ctx, {
      targetType: 'opportunity',
      targetId,
      epistemic: blank(epistemic) as EpistemicVerdict | null,
      delivery: blank(delivery) as DeliveryVerdict | null,
      artifact: blank(artifact) as ArtifactVerdict | null,
    })
    console.log(`feedback ${row.id}`)
    console.log(`  correctness: ${row.epistemic ?? 'not provided'}`)
    console.log(`  usefulness:  ${row.delivery ?? 'not provided'}`)
    console.log(`  artifact:    ${row.artifact ?? 'not provided'}`)
    return
  }

  if (command === 'correct') {
    const [feedbackId, epistemic, delivery] = rest
    if (!feedbackId) return usage()
    const row = await correctFeedback(ctx, feedbackId, {
      epistemic: blank(epistemic) as EpistemicVerdict | null,
      delivery: blank(delivery) as DeliveryVerdict | null,
    })
    console.log(`feedback ${row.id} corrects ${feedbackId}; the earlier row is still readable`)
    return
  }

  if (command === 'action') {
    const [opportunityId, kind, ...description] = rest
    if (!opportunityId || !kind) return usage()
    const row = await recordUserAction(ctx, {
      opportunityId, kind: kind as UserActionKind,
      description: description.join(' ') || null,
    })
    const resolution = await resolveOutcome(ctx, opportunityId)
    console.log(`action ${row.id} (${row.kind})`)
    console.log(resolution.written !== null
      ? `outcome → ${resolution.state}: ${resolution.reason}`
      : `outcome stays ${resolution.state}: ${resolution.reason}`)
    return
  }

  if (command === 'outcome') {
    const [opportunityId, state, ...note] = rest
    if (!opportunityId || !state) return usage()
    const row = await recordOutcome(ctx, {
      opportunityId, state: state as OutcomeState, note: note.join(' ') || null,
    })
    console.log(`outcome ${row.id}: ${row.state}`)
    return
  }

  if (command === 'history') {
    const [opportunityId] = rest
    if (!opportunityId) return usage()
    const history = await interventionHistory(ctx, opportunityId)
    if (history === null) {
      console.error('no such opportunity')
      process.exitCode = 1
      return
    }
    const t = history.timeline
    const stamp = (d: Date | null) => (d === null ? 'not recorded' : d.toISOString())
    console.log(history.opportunity.headline)
    console.log(`  correctness: ${history.feedback.epistemic ?? 'not provided'}`)
    console.log(`  usefulness:  ${history.feedback.delivery ?? 'not provided'}`)
    console.log(`  actions:     ${history.actions.map((a) => a.kind).join(', ') || 'none recorded'}`)
    console.log(`  outcome:     ${history.outcome?.state ?? 'not recorded'}`)
    console.log('  timeline:')
    console.log(`    evidence arrived   ${stamp(t.evidenceArrivedAt)}`)
    console.log(`    change detectable  ${stamp(t.changeDetectableAt)}`)
    console.log(`    change detected    ${stamp(t.changeDetectedAt)}`)
    console.log(`    opportunity made   ${stamp(t.opportunityGeneratedAt)}`)
    console.log(`    opportunity shown  ${stamp(t.opportunityShownAt)}`)
    console.log(`    you saw it         not recorded — shown is not seen`)
    console.log(`    feedback           ${stamp(t.feedbackAt)}`)
    console.log(`    action             ${stamp(t.userActionAt)}`)
    console.log(`    outcome            ${stamp(t.outcomeAt)}`)
    return
  }

  if (command === 'metrics') {
    const [workstreamId] = rest
    if (!workstreamId) return usage()
    const report = await interventionMetrics(ctx, workstreamId)
    console.log(`shown: ${report.counts.shown}`)
    console.log(`with feedback: ${report.counts.withFeedback} · without: ${report.counts.withoutFeedback}`)
    for (const [group, values] of Object.entries({
      correctness: report.counts.epistemic,
      usefulness: report.counts.delivery,
      artifact: report.counts.artifact,
      outcome: report.counts.outcome,
    })) {
      const parts = Object.entries(values).filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}=${n}`)
      console.log(`${group}: ${parts.join(' ') || 'nothing recorded'}`)
    }
    const o = report.observations
    console.log(`valuable: ${o.valuable.numerator}/${o.valuable.denominator} ${o.valuable.basis}`)
    console.log(`resolved: ${o.resolved.numerator}/${o.resolved.denominator} ${o.resolved.basis}`)
    console.log('')
    console.log(o.caveat)
    return
  }

  usage()
}

function usage(): void {
  console.error('usage: npm run feedback -- give|correct|action|outcome|history|metrics ...')
  process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
