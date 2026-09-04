import type { GroupSummary, ItemKind, ProjectSummary } from '@tigao/organizer-contracts';

export type OrganizerItem = ProjectSummary | GroupSummary;
export interface OrganizerSnapshot { projects: ProjectSummary[]; groups: GroupSummary[]; }
export interface MoveTarget { parentId: number | null; name: string; path: string; group: GroupSummary | null; }

export declare function compareSummaries(left: OrganizerItem, right: OrganizerItem): number;
export declare function sortSummaries<T extends OrganizerItem>(items: T[]): T[];
export declare function normalizeSortOrders<T extends OrganizerItem>(items: T[]): T[];
export declare function listDirectory(snapshot: OrganizerSnapshot, parentId?: number | null): OrganizerSnapshot;
export declare function validateGroupTree(groups: GroupSummary[]): Map<number, GroupSummary>;
export declare function buildBreadcrumbs(groups: GroupSummary[], parentId?: number | null): GroupSummary[];
export declare function getDescendantIds(groups: GroupSummary[], groupId: number): Set<number>;
export declare function formatGroupPath(groups: GroupSummary[], groupId: number, separator?: string): string;
export declare function listMoveTargets(groups: GroupSummary[], item?: { kind: ItemKind; id: string | number }, rootName?: string): MoveTarget[];
export declare function calculateOffsetBeforeId<T extends OrganizerItem>(items: T[], itemId: T['id'], offset: number): T['id'] | null | undefined;
export declare function calculateDropBeforeId<T extends OrganizerItem>(items: T[], activeId: T['id'], overId: T['id'], edge?: 'before' | 'after'): T['id'] | null;
export declare function applyReposition(snapshot: OrganizerSnapshot, request: { kind: ItemKind; id: string | number; parentId: number | null; beforeId: string | number | null }): OrganizerSnapshot;
export declare function createDragId(kind: ItemKind, id: string | number): string;
export declare function parseDragId(dragId: string): { kind: 'project'; id: string } | { kind: 'group'; id: number };
