// ============================================================
// İhale Pilotu Design System — barrel export
//
// shadcn/ui kompozisyon mimarisi: Card/Badge/Button/Tabs/DataTable
// primitive'leri her yüzeyin temel kabuğunu sağlar; SectionCard,
// MetricCard, RiskCard, ChecklistItem, StatusBadge, vb. bunların
// üzerine kompoze edilen anlamlı (domain-specific) component'lerdir.
// ============================================================

// --- Primitive'ler (shadcn/ui deseni) ---
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAccessory } from './Card';
export { Badge, type BadgeVariant } from './Badge';
export { Button, ButtonLink, type ButtonVariant, type ButtonSize } from './Button';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';
export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from './DataTable';

// --- Domain component'leri (primitive'ler üzerine kompoze edilir) ---
export { default as Logo } from './Logo';
export { default as SectionCard } from './SectionCard';
export { default as SectionHeader } from './SectionHeader';
export { default as MetricCard } from './MetricCard';
export type { MetricTone } from './MetricCard';
export { default as RiskCard } from './RiskCard';
export type { RiskLevel } from './RiskCard';
export { default as InfoCard, InfoRow } from './InfoCard';
export { default as StatusBadge } from './StatusBadge';
export type { StatusBadgeTone } from './StatusBadge';
export { default as SourceBadge } from './SourceBadge';
export type { DocumentSourceTone } from './SourceBadge';
export { default as EmptyState } from './EmptyState';
export { default as AccordionSection } from './AccordionSection';
export { default as ReferenceBadge } from './ReferenceBadge';
export { default as Timeline } from './Timeline';
export type { TimelineStep } from './Timeline';
export { default as ChecklistItem } from './ChecklistItem';
export { default as QuickFactCard } from './QuickFactCard';
export { default as EligibilityBadge } from './EligibilityBadge';
export type { EligibilityTone } from './EligibilityBadge';
export { default as MasonryGrid } from './MasonryGrid';
