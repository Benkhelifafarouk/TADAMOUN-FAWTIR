'use client';

import { createContext, useContext } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { initialActionState, type ActionState } from '@/lib/actions/state';
import type { Dictionary } from '@/lib/i18n';

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

const FormStateContext = createContext<ActionState>(initialActionState);

function SubmitButton({
  label,
  pendingLabel,
  variant,
}: {
  label: string;
  pendingLabel: string;
  variant: 'primary' | 'secondary' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        variant === 'primary'
          ? 'bg-brand-700 text-white hover:bg-brand-800 focus-visible:outline-brand-700'
          : variant === 'danger'
            ? 'bg-clay-600 text-white hover:bg-clay-500 focus-visible:outline-clay-600'
            : 'border border-sand-300 bg-white text-ink-900 hover:bg-sand-50 focus-visible:outline-brand-700'
      }`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Inline field error bound to the enclosing ActionForm state. */
export function FieldError({ name, dictionary }: { name: string; dictionary: Dictionary }) {
  const state = useContext(FormStateContext);
  const key = state.fieldErrors?.[name];
  if (!key) return null;
  return <p className="field-error">{resolve(dictionary, key)}</p>;
}

export interface ActionFormProps {
  action: Action;
  children: React.ReactNode;
  dictionary: Dictionary;
  submitLabel: string;
  submitVariant?: 'primary' | 'secondary' | 'danger';
  className?: string;
  hiddenFields?: Record<string, string>;
  showSubmit?: boolean;
}

/**
 * Thin client wrapper around useActionState. Server actions return dictionary
 * keys, never raw error text; field errors render next to their field.
 */
export function ActionForm({
  action,
  children,
  dictionary,
  submitLabel,
  submitVariant = 'primary',
  className,
  hiddenFields,
  showSubmit = true,
}: ActionFormProps) {
  const [state, formAction] = useActionState(action, initialActionState);

  const message = state.message;
  const isError = !state.ok && Boolean(message);
  const isSuccess = state.ok && Boolean(message);

  return (
    <form action={formAction} className={className} noValidate>
      {hiddenFields
        ? Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}

      {isError ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-clay-500/30 bg-clay-500/5 px-4 py-3 text-sm text-clay-600"
        >
          {resolve(dictionary, message!)}
        </div>
      ) : null}

      {isSuccess ? (
        <div
          role="status"
          className="mb-4 rounded-lg border border-brand-500/30 bg-brand-50 px-4 py-3 text-sm text-brand-800"
        >
          {resolve(dictionary, message!)}
          {state.data?.demoCode ? (
            <div className="mt-2">
              <p className="text-2xs font-semibold">{dictionary.auth.demoCode}</p>
              <p className="font-mono text-lg tracking-[0.35em] text-ink-950">{String(state.data.demoCode)}</p>
            </div>
          ) : null}
          {typeof state.data?.secret === 'string' ? (
            <p className="mt-2 break-all rounded bg-white/70 px-2 py-1 font-mono text-2xs text-ink-800">
              {String(state.data.secret)}
            </p>
          ) : null}
          {typeof state.data?.uri === 'string' ? (
            <p className="mt-2 break-all text-[10px] text-ink-500">{String(state.data.uri)}</p>
          ) : null}
        </div>
      ) : null}

      <FormStateContext.Provider value={state}>
        <div className="space-y-4">{children}</div>
      </FormStateContext.Provider>

      {showSubmit ? (
        <div className="mt-6">
          <SubmitButton label={submitLabel} pendingLabel={dictionary.common.loading} variant={submitVariant} />
        </div>
      ) : null}
    </form>
  );
}

function resolve(dictionary: Dictionary, key: string): string {
  const parts = key.split('.');
  let current: unknown = dictionary;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return key;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : key;
}
