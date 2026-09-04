import {
  OrganizerContractError,
  assertDirectoryResult,
  assertGroupTree,
  assertItemKind
} from '@tigao/organizer-contracts';
import { applyReposition, buildBreadcrumbs, listDirectory } from '@tigao/organizer-core';

function clone(value) {
  return structuredClone(value);
}

function defaultSeed() {
  return {
    owners: [
      { id: 1, username: 'current-user', readOnly: false },
      { id: 2, username: 'read-only-user', readOnly: true }
    ],
    groups: [
      { kind: 'group', id: 1, name: 'Lessons', parentId: null, sortOrder: 0, updatedAt: null, ownerId: 1 },
      { kind: 'group', id: 2, name: 'Week One', parentId: 1, sortOrder: 0, updatedAt: null, ownerId: 1 },
      { kind: 'group', id: 3, name: 'Exercises', parentId: 2, sortOrder: 0, updatedAt: null, ownerId: 1 },
      { kind: 'group', id: 4, name: 'Archive', parentId: null, sortOrder: 1, updatedAt: null, ownerId: 1 },
      { kind: 'group', id: 20, name: 'Shared', parentId: null, sortOrder: 0, updatedAt: null, ownerId: 2 }
    ],
    projects: [
      { kind: 'project', id: 'project-root-a', name: 'First Project', parentId: null, sortOrder: 0, updatedAt: null, ownerId: 1 },
      { kind: 'project', id: 'project-root-b', name: 'Second Project', parentId: null, sortOrder: 1, updatedAt: null, ownerId: 1 },
      { kind: 'project', id: 'project-deep', name: 'Deep Project', parentId: 3, sortOrder: 0, updatedAt: null, ownerId: 1 },
      { kind: 'project', id: 'project-read-only', name: 'Read-only Project', parentId: 20, sortOrder: 0, updatedAt: null, ownerId: 2 }
    ]
  };
}

function publicItem(item) {
  const { ownerId, templateId, ...summary } = item;
  return summary;
}

function adapterError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export class MemoryOrganizerAdapter {
  constructor(seed = defaultSeed()) {
    this.state = clone(seed);
    this.activeOwnerId = 1;
    this.nextGroupId = Math.max(0, ...this.state.groups.map((group) => group.id)) + 1;
    this.nextProjectId = 1;
    this.failures = new Map();
    this.corruptTree = false;
    this.openedProjects = [];
  }

  failNext(method, error = adapterError(`${method} failed.`, 'SIMULATED_FAILURE', 503)) {
    this.failures.set(method, error);
  }

  setCorruptTree(enabled) {
    this.corruptTree = enabled;
  }

  consumeFailure(method) {
    const error = this.failures.get(method);
    if (error) {
      this.failures.delete(method);
      throw error;
    }
  }

  owner(ownerId = null) {
    const resolvedId = ownerId ?? 1;
    const owner = this.state.owners.find((candidate) => candidate.id === resolvedId);
    if (!owner) throw adapterError(`Owner ${resolvedId} was not found.`, 'OWNER_NOT_FOUND', 404);
    return owner;
  }

  ownerSnapshot(ownerId = this.activeOwnerId) {
    return {
      groups: this.state.groups.filter((group) => group.ownerId === ownerId).map(publicItem),
      projects: this.state.projects.filter((project) => project.ownerId === ownerId).map(publicItem)
    };
  }

  ensureWritable() {
    if (this.owner(this.activeOwnerId).readOnly) {
      throw adapterError('This owner is read-only.', 'READ_ONLY', 403);
    }
  }

  async loadDirectory({ ownerId = null, parentId = null } = {}) {
    this.consumeFailure('loadDirectory');
    const owner = this.owner(ownerId);
    this.activeOwnerId = owner.id;
    const snapshot = this.ownerSnapshot(owner.id);
    if (this.corruptTree && snapshot.groups.length > 0) snapshot.groups[0].parentId = snapshot.groups[0].id;
    const directory = listDirectory(snapshot, parentId);
    const result = {
      ...directory,
      breadcrumbs: buildBreadcrumbs(snapshot.groups, parentId),
      owner: { id: owner.id, username: owner.username },
      readOnly: owner.readOnly
    };
    return assertDirectoryResult(result, { parentId });
  }

  async loadAllGroups({ ownerId = null } = {}) {
    this.consumeFailure('loadAllGroups');
    const owner = this.owner(ownerId);
    this.activeOwnerId = owner.id;
    const groups = this.ownerSnapshot(owner.id).groups;
    if (this.corruptTree && groups.length > 0) groups[0].parentId = groups[0].id;
    assertGroupTree(groups);
    return groups;
  }

  async createProject({ name, parentId = null, templateId } = {}) {
    this.consumeFailure('createProject');
    this.ensureWritable();
    const snapshot = this.ownerSnapshot();
    if (parentId !== null && !snapshot.groups.some((group) => group.id === parentId)) {
      throw adapterError('The target group does not exist.', 'GROUP_NOT_FOUND', 404);
    }
    const item = {
      kind: 'project',
      id: `memory-project-${this.nextProjectId++}`,
      name: name.trim(),
      parentId,
      sortOrder: snapshot.projects.filter((project) => project.parentId === parentId).length,
      updatedAt: null
    };
    this.state.projects.push({ ...item, ownerId: this.activeOwnerId, templateId });
    return item;
  }

  async createGroup({ name, parentId = null } = {}) {
    this.consumeFailure('createGroup');
    this.ensureWritable();
    const snapshot = this.ownerSnapshot();
    if (parentId !== null && !snapshot.groups.some((group) => group.id === parentId)) {
      throw adapterError('The target group does not exist.', 'GROUP_NOT_FOUND', 404);
    }
    const item = {
      kind: 'group',
      id: this.nextGroupId++,
      name: name.trim(),
      parentId,
      sortOrder: snapshot.groups.filter((group) => group.parentId === parentId).length,
      updatedAt: null
    };
    this.state.groups.push({ ...item, ownerId: this.activeOwnerId });
    return item;
  }

  async renameItem({ kind, id, name }) {
    this.consumeFailure('renameItem');
    this.ensureWritable();
    assertItemKind(kind);
    const collection = kind === 'project' ? this.state.projects : this.state.groups;
    const item = collection.find((candidate) => candidate.ownerId === this.activeOwnerId && candidate.id === id);
    if (!item) throw adapterError('The item does not exist.', 'ITEM_NOT_FOUND', 404);
    item.name = name.trim();
    return publicItem(item);
  }

  async repositionItem(request) {
    this.consumeFailure('repositionItem');
    this.ensureWritable();
    const original = clone(this.state);
    try {
      const snapshot = this.ownerSnapshot();
      const next = applyReposition(snapshot, request);
      this.state.projects = this.state.projects.filter((item) => item.ownerId !== this.activeOwnerId)
        .concat(next.projects.map((item) => ({ ...item, ownerId: this.activeOwnerId })));
      this.state.groups = this.state.groups.filter((item) => item.ownerId !== this.activeOwnerId)
        .concat(next.groups.map((item) => ({ ...item, ownerId: this.activeOwnerId })));
      const collection = request.kind === 'project' ? next.projects : next.groups;
      return { repositioned: true, item: collection.find((item) => item.id === request.id) };
    } catch (error) {
      this.state = original;
      throw error;
    }
  }

  async deleteItem({ kind, id }) {
    this.consumeFailure('deleteItem');
    this.ensureWritable();
    assertItemKind(kind);
    const key = kind === 'project' ? 'projects' : 'groups';
    const item = this.state[key].find((candidate) => candidate.ownerId === this.activeOwnerId && candidate.id === id);
    if (!item) throw adapterError('The item does not exist.', 'ITEM_NOT_FOUND', 404);
    if (kind === 'group') {
      const hasChildren = this.state.groups.some((group) => group.ownerId === this.activeOwnerId && group.parentId === id)
        || this.state.projects.some((project) => project.ownerId === this.activeOwnerId && project.parentId === id);
      if (hasChildren) throw adapterError('Only empty groups can be deleted.', 'GROUP_NOT_EMPTY', 409);
    }
    this.state[key] = this.state[key].filter((candidate) => candidate !== item);
    return { deleted: true };
  }

  async openProject(id) {
    this.consumeFailure('openProject');
    const project = this.state.projects.find((candidate) => candidate.ownerId === this.activeOwnerId && candidate.id === id);
    if (!project) throw adapterError('The project does not exist.', 'ITEM_NOT_FOUND', 404);
    this.openedProjects.push(id);
    return { opened: id };
  }
}

export function createMemoryOrganizerHarness(seed) {
  const adapter = new MemoryOrganizerAdapter(seed);
  return {
    adapter,
    controls: {
      failNext: (method, error) => adapter.failNext(method, error),
      setCorruptTree: (enabled) => adapter.setCorruptTree(enabled)
    },
    getState: () => clone(adapter.state),
    getOpenedProjects: () => [...adapter.openedProjects]
  };
}
