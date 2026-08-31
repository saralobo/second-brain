import { getContext } from '@ava/app'
import { CaptureForm } from './capture-form'

export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ workstream?: string; supersedes?: string }>
}) {
  const params = await searchParams
  const ctx = await getContext()
  const workstreams = await ctx.workstreams.list()

  if (workstreams.length === 0) {
    return (
      <>
        <h1>Capture</h1>
        <div className="empty" style={{ marginTop: 18 }}>
          <strong>There is no workstream yet.</strong>
          <p style={{ margin: '6px 0 0' }}>
            Capture belongs to a workstream. <a href="/">Create one first.</a>
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <h1>Capture</h1>
      <p className="meta">
        Manual input is a deliberate feature, not a stopgap: it is what makes the observation
        time correct at the source. Every capture passes the full quarantine pipeline.
      </p>
      <CaptureForm
        workstreams={workstreams.map((w) => ({ id: w.id, name: w.name }))}
        defaultWorkstreamId={params.workstream ?? workstreams[0]?.id ?? ''}
        supersedes={params.supersedes ?? ''}
      />
    </>
  )
}
