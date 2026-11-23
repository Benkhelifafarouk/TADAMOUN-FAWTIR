import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import type { Locale } from '@/lib/i18n/config';

export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

export function Card({
  children,
  className,
  as: As = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return <As className={cn('surface p-5 sm:p-6', className)}>{children}</As>;
}

export function SectionTitle({
  title,
  subtitle,
  id,
  action,
}: {
  title: string;
  subtitle?: string;
  id?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-xl font-bold sm:text-2xl">
          {title}
        </h2>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="mb-2 text-2xs font-bold uppercase tracking-[0.18em] text-brand-600">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm leading-6 text-ink-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const toneClasses: Record<Tone, string> = {
  neutral: 'border-sand-300 bg-sand-100 text-ink-600',
  brand: 'border-brand-200 bg-brand-50 text-brand-800',
  success: 'border-brand-300 bg-brand-100 text-brand-900',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
  danger: 'border-clay-500/30 bg-clay-500/10 text-clay-600',
  info: 'border-ink-300/40 bg-ink-900/5 text-ink-700',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-2xs font-semibold',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function DemoBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600">
      {label}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="surface p-5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p
        className={cn(
          'mt-2 text-2xl font-bold tabular-nums',
          tone === 'danger' ? 'text-clay-600' : tone === 'warning' ? 'text-amber-600' : 'text-ink-950',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-2xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

export function Progress({
  value,
  tone = 'brand',
  label,
}: {
  value: number;
  tone?: 'brand' | 'success';
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-sand-200"
    >
      <div
        className={cn('h-full rounded-full transition-[width]', tone === 'success' ? 'bg-brand-500' : 'bg-brand-600')}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children?: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    info: 'border-brand-200 bg-brand-50 text-brand-900',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
    danger: 'border-clay-500/30 bg-clay-500/5 text-clay-600',
    success: 'border-brand-300 bg-brand-50 text-brand-900',
  };
  return (
    <div role="note" className={cn('rounded-xl border px-4 py-3 text-sm leading-6', styles[tone])}>
      {title ? <p className="mb-1 font-bold">{title}</p> : null}
      {children}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl2 border border-dashed border-sand-300 bg-sand-100/40 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-ink-700">{title}</p>
      {hint ? <p className="mx-auto mt-2 max-w-md text-2xs leading-relaxed text-ink-400">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ms-1 text-clay-500">*</span> : null}
      </label>
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function Money({ centimes, locale }: { centimes: number; locale: Locale }) {
  const label = locale === 'ar' ? 'دج' : 'DA';
  return <span className="tabular-nums">{formatMoney(centimes, locale, label)}</span>;
}

export function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sand-200/70 py-2.5 last:border-b-0">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="text-sm font-medium text-ink-900">{children}</dd>
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}) {
  const styles =
    variant === 'primary'
      ? 'bg-brand-700 text-white hover:bg-brand-800'
      : variant === 'secondary'
        ? 'border border-sand-300 bg-white text-ink-900 hover:bg-sand-50'
        : 'text-brand-700 hover:bg-brand-50';
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700',
        styles,
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function DemoNotice({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-2xs leading-relaxed text-amber-600">
      <span className="me-1 font-bold uppercase tracking-wide">DEMO</span>
      {text}
    </div>
  );
}
