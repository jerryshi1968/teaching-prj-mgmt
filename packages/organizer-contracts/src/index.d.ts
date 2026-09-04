export type ItemKind = 'project' | 'group';

export interface ProjectSummary {
  kind: 'project';
  id: string;
  name: string;
  parentId: number | null;
  sortOrder: number;
  updatedAt: string | null;
}

export interface GroupSummary {
  kind: 'group';
  id: number;
  name: string;
  parentId: number | null;
  sortOrder: number;
  updatedAt: string | null;
}

export interface DirectoryResult {
  projects: ProjectSummary[];
  groups: GroupSummary[];
  breadcrumbs: GroupSummary[];
  owner: { id: number; username: string } | null;
  readOnly: boolean;
}

export interface OrganizerErrorDetails {
  message: string;
  code?: string;
  status?: number;
}

export interface ProjectOrganizerAdapter {
  loadDirectory(request: { ownerId?: number | null; parentId?: number | null }): Promise<DirectoryResult>;
  loadAllGroups(request: { ownerId?: number | null }): Promise<GroupSummary[]>;
  createProject(request: { name: string; parentId?: number | null; templateId?: unknown }): Promise<ProjectSummary>;
  createGroup(request: { name: string; parentId?: number | null }): Promise<GroupSummary>;
  renameItem(request: { kind: ItemKind; id: string | number; name: string }): Promise<ProjectSummary | GroupSummary>;
  repositionItem(request: { kind: ItemKind; id: string | number; parentId: number | null; beforeId: string | number | null }): Promise<{ repositioned: true; item: ProjectSummary | GroupSummary }>;
  deleteItem(request: { kind: ItemKind; id: string | number }): Promise<{ deleted: true }>;
  openProject(id: string): unknown;
}

export declare const ITEM_KINDS: readonly ItemKind[];
export declare const ADAPTER_METHODS: readonly string[];
export declare class OrganizerContractError extends Error { code: string; }
export declare function assertItemKind(kind: unknown): ItemKind;
export declare function assertProjectSummary(project: unknown, label?: string): ProjectSummary;
export declare function assertGroupSummary(group: unknown, label?: string): GroupSummary;
export declare function assertGroupTree(groups: unknown): GroupSummary[];
export declare function assertDirectoryResult(result: unknown, options?: { parentId?: number | null }): DirectoryResult;
export declare function assertOrganizerAdapter(adapter: unknown): ProjectOrganizerAdapter;
export declare function assertRepositionRequest(request: unknown): { kind: ItemKind; id: string | number; parentId: number | null; beforeId: string | number | null };
export declare function getOrganizerErrorDetails(error: unknown): OrganizerErrorDetails;
