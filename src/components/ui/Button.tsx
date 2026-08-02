import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-card hover:bg-brand-700',
  outline: 'border border-border-strong text-slate-700 hover:bg-surface-muted',
  ghost: 'text-slate-700 hover:bg-surface-muted'
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'gap-1.5 rounded-lg px-3 py-1.5 text-xs',
  md: 'gap-2 rounded-lg px-4 py-2 text-sm'
};

const BASE = 'inline-flex shrink-0 items-center justify-center font-medium transition disabled:opacity-60 disabled:cursor-not-allowed';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

/** Standart <button> — formlar ve tıklanabilir aksiyonlar için. */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(BASE, VARIANT_STYLES[variant], SIZE_STYLES[size], className)} {...props}>
      {children}
    </button>
  );
}

/** <a> tabanlı buton görünümü — örn. "Excel İndir" linki, "Analizi Yenile" anchor scroll. */
export function ButtonLink({
  variant = 'outline',
  size = 'md',
  className,
  children,
  ...props
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={cn(BASE, VARIANT_STYLES[variant], SIZE_STYLES[size], className)} {...props}>
      {children}
    </a>
  );
}
