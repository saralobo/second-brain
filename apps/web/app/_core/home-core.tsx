'use client'

import { useRouter } from 'next/navigation'
import { AvaCore, CoreStateLabel } from './ava-core'
import type { CoreState } from './ava-core'

/**
 * AVA Core on the home surface.
 *
 * The state shown is a real system condition, never a decorative prop:
 * `attention` means eligible opportunities are waiting, `degraded` means a
 * workstream's Context Health says so.
 */
export function HomeCore({
  attentionCount, degraded,
}: { attentionCount: number; degraded: boolean }) {
  const router = useRouter()
  const state: CoreState =
    degraded ? 'degraded' : attentionCount > 0 ? 'attention' : 'idle'

  return (
    <>
      <AvaCore
        state={state}
        size={280}
        onActivate={() => router.push('/live')}
        activateLabel="Talk to AVA"
      />
      <CoreStateLabel state={state} />
    </>
  )
}
