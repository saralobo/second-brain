import { getContext } from '../context'
import { buildProviderRegistry } from '../provider-setup'
import { ask } from '../answer-service'

/**
 * Ask AVA a question from the command line.
 *
 *   npm run ask -- <workstreamId> "What changed in this project?"
 *
 * Uses the same code path as the chat surface, including the provider
 * boundary. With no ANTHROPIC_API_KEY it runs in mock mode and stays local.
 */
async function main(): Promise<void> {
  const [workstreamId, ...rest] = process.argv.slice(2)
  const question = rest.join(' ')
  if (!workstreamId || question === '') {
    console.error('usage: npm run ask -- <workstreamId> "<question>"')
    process.exitCode = 1
    return
  }

  const ctx = await getContext()
  const setup = await buildProviderRegistry()
  const conversation = await ctx.conversations.ensureLatest(workstreamId)
  await ctx.conversations.addMessage({ conversationId: conversation.id, role: 'user', body: question })

  const res = await ask(
    ctx,
    { registry: setup.registry, providerName: setup.active, caps: setup.caps },
    { workstreamId, question, conversationId: conversation.id },
  )

  console.log(`mode:            ${res.executionMode}`)
  console.log(`context health:  ${res.contextHealth.state}`)
  console.log(`abstained:       ${res.abstained}`)
  console.log(`decision record: ${res.decisionRecordId}`)
  console.log(`evidence used:   ${res.evidence.map((e) => e.evidenceId).join(', ') || 'none'}`)
  console.log('')
  console.log(res.answer)
  if (res.uncertainties.length > 0) {
    console.log('')
    console.log('uncertainties:')
    for (const u of res.uncertainties) console.log(`  - ${u}`)
  }
  await ctx.db.close()
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
