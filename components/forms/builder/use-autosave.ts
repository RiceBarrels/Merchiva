"use client";

// The builder's local draft and its autosave (design B.6: autosave with expectedVersion).
//
// Every edit bumps `revision`; a short debounce later the validated draft is sent with the
// version it was based on. The module answers `[forms.conflict]` when someone else saved in
// between: the builder then stops saving and asks whether to keep this draft (re-saved over
// theirs) or load theirs. A server change that arrives while nothing is pending is adopted
// silently. Invalid drafts are never sent: the editor shows the issues instead.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkDefinitionEdit, validateDefinition, type FormIssue } from "@/lib/forms/schema";
import type { FormDefinitionV1, FormView } from "@/lib/forms/types";
import { formsErrorCode, formsErrorKey, updateFormDefinition } from "@/lib/spacetimedb/actions/forms";

const SAVE_DELAY_MS = 800;

export type AutosaveStatus = "saved" | "pending" | "saving" | "invalid" | "conflict" | "error";

interface DraftState {
  formId: string;
  draft: FormDefinitionV1;
  /** The server version the draft builds on (the `expectedVersion` of the next save). */
  baseVersion: number;
  revision: number;
  /** Edits not yet acknowledged by the server. */
  dirty: boolean;
  saving: boolean;
  conflict: boolean;
  /** The revision whose save failed (not retried until the next edit). */
  failedRevision: number;
  errorKey: string | null;
}

function fromForm(form: FormView, definition: FormDefinitionV1): DraftState {
  return {
    formId: form.id, draft: definition, baseVersion: form.version, revision: 0, dirty: false, saving: false,
    conflict: false, failedRevision: -1, errorKey: null,
  };
}

export interface FormAutosave {
  draft: FormDefinitionV1 | null;
  setDraft: (update: (def: FormDefinitionV1) => FormDefinitionV1) => void;
  status: AutosaveStatus;
  /** Validation and type-lock issues of the current draft (empty when it can be saved). */
  issues: FormIssue[];
  /** i18n key of the last failed save. */
  errorKey: string | null;
  /** Conflict: save this draft over the newer server version. */
  keepMine: () => void;
  /** Conflict (or any time): drop local edits and load the server version. */
  loadTheirs: () => void;
  /** Retry a failed save now. */
  retry: () => void;
}

export function useFormAutosave(form: FormView | null, hasResponses: boolean): FormAutosave {
  const [state, setState] = useState<DraftState | null>(null);

  // Adopt the server copy during render (no effect round-trip): a new form, or a newer version while nothing
  // local is pending. A newer version under pending edits is a conflict.
  if (form?.definition) {
    if (!state || state.formId !== form.id) {
      setState(fromForm(form, form.definition));
    } else if (form.version > state.baseVersion && !state.saving) {
      if (!state.dirty) setState(fromForm(form, form.definition));
      else if (!state.conflict) setState({ ...state, conflict: true });
    }
  }

  const current = state && form && state.formId === form.id ? state : null;
  const server = form?.definition ?? null;

  const validation = useMemo(() => {
    if (!current) return { value: null as FormDefinitionV1 | null, issues: [] as FormIssue[] };
    const result = validateDefinition(current.draft);
    if (!result.ok) return { value: null, issues: result.issues };
    const locked = server ? checkDefinitionEdit(server, result.value, hasResponses) : [];
    return locked.length > 0 ? { value: null, issues: locked } : { value: result.value, issues: [] };
  }, [current, server, hasResponses]);

  const save = useCallback(async (formId: string, value: FormDefinitionV1, expected: number, revision: number) => {
    setState((s) => (s && s.formId === formId ? { ...s, saving: true } : s));
    try {
      await updateFormDefinition(formId, value, expected);
      setState((s) => (s && s.formId === formId
        ? { ...s, saving: false, baseVersion: expected + 1, dirty: s.revision !== revision, errorKey: null }
        : s));
    } catch (err) {
      const conflict = formsErrorCode(err) === "conflict";
      setState((s) => (s && s.formId === formId
        ? { ...s, saving: false, conflict, failedRevision: conflict ? -1 : revision, errorKey: conflict ? null : formsErrorKey(err) }
        : s));
    }
  }, []);

  const value = validation.value;
  const canSave = !!current && current.dirty && !current.saving && !current.conflict && current.failedRevision !== current.revision;
  useEffect(() => {
    if (!canSave || !current || !value) return;
    const { formId, baseVersion, revision } = current;
    const timer = setTimeout(() => { void save(formId, value, baseVersion, revision); }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [canSave, current, value, save]);

  // Leaving the page inside the debounce still saves the last valid edit.
  const pendingRef = useRef<{ formId: string; value: FormDefinitionV1; expected: number } | null>(null);
  useEffect(() => {
    pendingRef.current = canSave && current && value ? { formId: current.formId, value, expected: current.baseVersion } : null;
  }, [canSave, current, value]);
  useEffect(() => () => {
    const pending = pendingRef.current;
    if (pending) updateFormDefinition(pending.formId, pending.value, pending.expected).catch(() => undefined);
  }, []);

  const setDraft = useCallback((update: (def: FormDefinitionV1) => FormDefinitionV1) => {
    setState((s) => (s ? { ...s, draft: update(s.draft), revision: s.revision + 1, dirty: true, errorKey: null } : s));
  }, []);

  const keepMine = useCallback(() => {
    if (!form) return;
    setState((s) => (s ? { ...s, baseVersion: form.version, conflict: false, failedRevision: -1, dirty: true } : s));
  }, [form]);

  const loadTheirs = useCallback(() => {
    if (form?.definition) setState(fromForm(form, form.definition));
  }, [form]);

  const retry = useCallback(() => {
    setState((s) => (s ? { ...s, failedRevision: -1, errorKey: null } : s));
  }, []);

  let status: AutosaveStatus = "saved";
  if (current?.conflict) status = "conflict";
  else if (current?.saving) status = "saving";
  else if (current?.errorKey) status = "error";
  else if (current?.dirty) status = validation.issues.length > 0 ? "invalid" : "pending";

  return {
    draft: current?.draft ?? null,
    setDraft,
    status,
    issues: current ? validation.issues : [],
    errorKey: current?.errorKey ?? null,
    keepMine,
    loadTheirs,
    retry,
  };
}
