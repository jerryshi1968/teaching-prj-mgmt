import type { ProjectOrganizerAdapter } from '@tigao/organizer-contracts';

export interface OrganizerHarness {
  adapter: ProjectOrganizerAdapter;
  controls?: Record<string, (...args: any[]) => unknown>;
  getState?: () => unknown;
}

export declare class MemoryOrganizerAdapter implements ProjectOrganizerAdapter {
  constructor(seed?: unknown);
  loadDirectory(request: any): Promise<any>;
  loadAllGroups(request: any): Promise<any>;
  createProject(request: any): Promise<any>;
  createGroup(request: any): Promise<any>;
  renameItem(request: any): Promise<any>;
  repositionItem(request: any): Promise<any>;
  deleteItem(request: any): Promise<any>;
  openProject(id: string): Promise<any>;
  failNext(method: string, error?: Error): void;
  setCorruptTree(enabled: boolean): void;
}

export declare function createMemoryOrganizerHarness(seed?: unknown): OrganizerHarness & {
  controls: { failNext(method: string, error?: Error): void; setCorruptTree(enabled: boolean): void };
  getState(): any;
  getOpenedProjects(): string[];
};
export declare function runProjectOrganizerAdapterContract(options: {
  test(name: string, operation: () => unknown | Promise<unknown>): void;
  assert: any;
  createHarness(): OrganizerHarness;
}): void;
