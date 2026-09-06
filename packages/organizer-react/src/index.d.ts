import type { ReactNode } from 'react';
import type { DirectoryResult, GroupSummary, OrganizerErrorDetails, ProjectOrganizerAdapter, ProjectSummary } from '@tigao/organizer-contracts';
import type { MoveTarget } from '@tigao/organizer-core';

export interface ProjectOrganizerProps {
  adapter: ProjectOrganizerAdapter;
  ownerId?: number | null;
  currentParentId?: number | null;
  onCurrentParentIdChange?: (parentId: number | null) => void;
  messages?: Record<string, string>;
  icons?: Record<string, ReactNode | ((props: { 'aria-hidden': true }) => ReactNode)>;
  onError?: (error: unknown) => void;
  renderProjectExtraActions?: (project: ProjectSummary) => ReactNode;
  renderProjectHostActions?: (project: ProjectSummary, context: { readOnly: boolean }) => ReactNode;
}

export declare function ProjectOrganizer(props: ProjectOrganizerProps): ReactNode;
export declare function useProjectOrganizer(props: Omit<ProjectOrganizerProps, 'messages' | 'icons' | 'renderProjectExtraActions' | 'renderProjectHostActions'>): {
  directory: DirectoryResult | null;
  loading: boolean;
  error: OrganizerErrorDetails | null;
  treeBlocked: boolean;
  pendingIds: Set<string>;
  saving: boolean;
  reload(): Promise<DirectoryResult | null>;
  navigate(parentId: number | null): void;
  createProject(request: { name: string; templateId?: unknown }): Promise<ProjectSummary | null>;
  createGroup(request: { name: string }): Promise<GroupSummary | null>;
  renameItem(item: ProjectSummary | GroupSummary, name: string): Promise<ProjectSummary | GroupSummary | null>;
  deleteItem(item: ProjectSummary | GroupSummary): Promise<{ deleted: true } | null>;
  repositionItem(item: ProjectSummary | GroupSummary, parentId: number | null, beforeId: string | number | null): Promise<unknown>;
  openProject(id: string): Promise<unknown>;
  loadMoveTargets(item: ProjectSummary | GroupSummary, rootName: string): Promise<MoveTarget[]>;
};
