'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(componentName: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error(`${componentName}, bir <Tabs> içinde kullanılmalı.`);
  return ctx;
}

/**
 * Tabs primitive ailesi — shadcn/ui kompozisyon deseni, Radix bağımlılığı
 * olmadan basit React state ile. Kullanım:
 *
 * <Tabs defaultValue="analiz">
 *   <TabsList>
 *     <TabsTrigger value="analiz">Şartname Analizi</TabsTrigger>
 *     <TabsTrigger value="cetvel">Birim Fiyat Cetveli</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="analiz">...</TabsContent>
 *   <TabsContent value="cetvel">...</TabsContent>
 * </Tabs>
 */
export function Tabs({
  defaultValue,
  className,
  children
}: {
  defaultValue: string;
  className?: string;
  children: ReactNode;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-xl border border-border bg-surface-muted p-1', className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useTabsContext('TabsTrigger');
  const isActive = ctx.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      aria-selected={isActive}
      className={cn(
        'rounded-lg px-3.5 py-1.5 text-sm font-medium transition',
        isActive ? 'bg-surface text-brand-700 shadow-card' : 'text-muted-foreground hover:text-slate-700'
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children }: { value: string; className?: string; children: ReactNode }) {
  const ctx = useTabsContext('TabsContent');
  if (ctx.value !== value) return null;
  return <div className={cn('mt-4', className)}>{children}</div>;
}
