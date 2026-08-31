/**
 * Shared form state.
 *
 * This lives outside actions.ts on purpose: a module marked 'use server' may
 * only export async functions, so a constant exported from there arrives as
 * undefined on the client.
 */
export interface FormState {
  error: string | null
  issues: { field: string; message: string }[]
  createdEvidenceId: string | null
}

export const EMPTY_FORM_STATE: FormState = { error: null, issues: [], createdEvidenceId: null }
