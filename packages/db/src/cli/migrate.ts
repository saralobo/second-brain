import { migrate, openDatabase, appliedMigrations } from '../index'

const db = await openDatabase()
const applied = await migrate(db)
const all = await appliedMigrations(db)
if (applied.length === 0) {
  console.log(`no new migrations. applied: ${all.length}`)
} else {
  for (const m of applied) console.log(`applied ${m}`)
}
await db.close()
