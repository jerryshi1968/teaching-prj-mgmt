/**
 * @typedef {object} ProjectSummary
 * @property {'project'} kind
 * @property {string} id
 * @property {string} name
 * @property {number|null} parentId
 * @property {number} sortOrder
 * @property {string|null} updatedAt
 */

/**
 * @typedef {object} GroupSummary
 * @property {'group'} kind
 * @property {number} id
 * @property {string} name
 * @property {number|null} parentId
 * @property {number} sortOrder
 * @property {string|null} updatedAt
 */

/**
 * @typedef {object} DirectoryResult
 * @property {ProjectSummary[]} projects
 * @property {GroupSummary[]} groups
 * @property {GroupSummary[]} breadcrumbs
 * @property {{id: number, username: string}|null} owner
 * @property {boolean} readOnly
 */

/**
 * @typedef {object} ProjectOrganizerAdapter
 * @property {(request: {ownerId?: number|null, parentId?: number|null}) => Promise<DirectoryResult>} loadDirectory
 * @property {(request: {ownerId?: number|null}) => Promise<GroupSummary[]>} loadAllGroups
 * @property {(request: {name: string, parentId?: number|null, templateId?: unknown}) => Promise<ProjectSummary>} createProject
 * @property {(request: {name: string, parentId?: number|null}) => Promise<GroupSummary>} createGroup
 * @property {(request: {kind: 'project'|'group', id: string|number, name: string}) => Promise<ProjectSummary|GroupSummary>} renameItem
 * @property {(request: {kind: 'project'|'group', id: string|number, parentId: number|null, beforeId: string|number|null}) => Promise<{repositioned: true, item: ProjectSummary|GroupSummary}>} repositionItem
 * @property {(request: {kind: 'project'|'group', id: string|number}) => Promise<{deleted: true}>} deleteItem
 * @property {(id: string) => unknown} openProject
 */

export const ITEM_KINDS = Object.freeze(['project', 'group']);

export class OrganizerContractError extends Error {
  constructor(message, code = 'INVALID_ORGANIZER_CONTRACT') {
    super(message);
    this.name = 'OrganizerContractError';
    this.code = code;
  }
}

function fail(message, code) {
  throw new OrganizerContractError(message, code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertRecord(value, label) {
  if (!isRecord(value)) fail(`${label} must be an object.`);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string.`);
}

function assertParentId(value, label) {
  if (value !== null && (!Number.isInteger(value) || value <= 0)) {
    fail(`${label} must be null or a positive integer.`);
  }
}

function assertSortOrder(value, label) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    fail(`${label} must be a finite non-negative integer.`);
  }
}

function assertUpdatedAt(value, label) {
  if (value !== null && typeof value !== 'string') fail(`${label} must be null or a string.`);
}

export function assertItemKind(kind) {
  if (!ITEM_KINDS.includes(kind)) fail('kind must be project or group.', 'INVALID_ITEM_KIND');
  return kind;
}

export function assertProjectSummary(project, label = 'project') {
  assertRecord(project, label);
  if (project.kind !== 'project') fail(`${label}.kind must be project.`);
  assertNonEmptyString(project.id, `${label}.id`);
  assertNonEmptyString(project.name, `${label}.name`);
  assertParentId(project.parentId, `${label}.parentId`);
  assertSortOrder(project.sortOrder, `${label}.sortOrder`);
  assertUpdatedAt(project.updatedAt, `${label}.updatedAt`);
  return project;
}

export function assertGroupSummary(group, label = 'group') {
  assertRecord(group, label);
  if (group.kind !== 'group') fail(`${label}.kind must be group.`);
  if (!Number.isInteger(group.id) || group.id <= 0) fail(`${label}.id must be a positive integer.`);
  assertNonEmptyString(group.name, `${label}.name`);
  assertParentId(group.parentId, `${label}.parentId`);
  assertSortOrder(group.sortOrder, `${label}.sortOrder`);
  assertUpdatedAt(group.updatedAt, `${label}.updatedAt`);
  return group;
}

function assertUniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) fail(`${label} contains duplicate id ${item.id}.`, 'DUPLICATE_ITEM_ID');
    ids.add(item.id);
  }
}

export function assertGroupTree(groups) {
  if (!Array.isArray(groups)) fail('groups must be an array.');
  groups.forEach((group, index) => assertGroupSummary(group, `groups[${index}]`));
  assertUniqueIds(groups, 'groups');
  const byId = new Map(groups.map((group) => [group.id, group]));

  for (const group of groups) {
    if (group.parentId !== null && !byId.has(group.parentId)) {
      fail(`Group ${group.id} has a missing parent ${group.parentId}.`, 'INVALID_GROUP_TREE');
    }
    const visited = new Set([group.id]);
    let parentId = group.parentId;
    while (parentId !== null) {
      if (visited.has(parentId)) fail(`Group tree contains a cycle at ${parentId}.`, 'INVALID_GROUP_TREE');
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
  return groups;
}

export function assertDirectoryResult(result, options = {}) {
  assertRecord(result, 'directory result');
  if (!Array.isArray(result.projects)) fail('directory result.projects must be an array.');
  if (!Array.isArray(result.groups)) fail('directory result.groups must be an array.');
  if (!Array.isArray(result.breadcrumbs)) fail('directory result.breadcrumbs must be an array.');
  result.projects.forEach((project, index) => assertProjectSummary(project, `projects[${index}]`));
  result.groups.forEach((group, index) => assertGroupSummary(group, `groups[${index}]`));
  result.breadcrumbs.forEach((group, index) => assertGroupSummary(group, `breadcrumbs[${index}]`));
  assertUniqueIds(result.projects, 'projects');
  assertUniqueIds(result.groups, 'groups');
  assertUniqueIds(result.breadcrumbs, 'breadcrumbs');

  for (let index = 0; index < result.breadcrumbs.length; index += 1) {
    const expectedParentId = index === 0 ? null : result.breadcrumbs[index - 1].id;
    if (result.breadcrumbs[index].parentId !== expectedParentId) {
      fail('breadcrumbs must be ordered from root to current group.', 'INVALID_BREADCRUMBS');
    }
  }
  if (Object.hasOwn(options, 'parentId')) {
    const hasMismatchedItem = [...result.projects, ...result.groups]
      .some((item) => item.parentId !== options.parentId);
    if (hasMismatchedItem) {
      fail('Directory items must belong to the requested parentId.', 'INVALID_DIRECTORY');
    }
    const finalId = result.breadcrumbs.at(-1)?.id ?? null;
    if (finalId !== options.parentId) {
      fail('The final breadcrumb must equal the requested parentId.', 'INVALID_BREADCRUMBS');
    }
  }

  if (result.owner !== null) {
    assertRecord(result.owner, 'directory result.owner');
    if (!Number.isInteger(result.owner.id) || result.owner.id <= 0) fail('owner.id must be a positive integer.');
    assertNonEmptyString(result.owner.username, 'owner.username');
  }
  if (typeof result.readOnly !== 'boolean') fail('directory result.readOnly must be a boolean.');
  return result;
}

export const ADAPTER_METHODS = Object.freeze([
  'loadDirectory',
  'loadAllGroups',
  'createProject',
  'createGroup',
  'renameItem',
  'repositionItem',
  'deleteItem',
  'openProject'
]);

export function assertOrganizerAdapter(adapter) {
  assertRecord(adapter, 'adapter');
  for (const method of ADAPTER_METHODS) {
    if (typeof adapter[method] !== 'function') fail(`adapter.${method} must be a function.`, 'INVALID_ADAPTER');
  }
  return adapter;
}

export function assertRepositionRequest(request) {
  assertRecord(request, 'reposition request');
  assertItemKind(request.kind);
  if (request.kind === 'project') assertNonEmptyString(request.id, 'reposition request.id');
  if (request.kind === 'group' && (!Number.isInteger(request.id) || request.id <= 0)) {
    fail('reposition request.id must be a positive integer for a group.');
  }
  if (!Object.hasOwn(request, 'parentId')) fail('reposition request.parentId must be explicit.');
  if (!Object.hasOwn(request, 'beforeId')) fail('reposition request.beforeId must be explicit.');
  assertParentId(request.parentId, 'reposition request.parentId');
  if (request.beforeId !== null) {
    if (request.kind === 'project') assertNonEmptyString(request.beforeId, 'reposition request.beforeId');
    if (request.kind === 'group' && (!Number.isInteger(request.beforeId) || request.beforeId <= 0)) {
      fail('reposition request.beforeId must be a positive integer for a group.');
    }
  }
  return request;
}

export function getOrganizerErrorDetails(error) {
  const source = error instanceof Error || isRecord(error) ? error : { message: String(error) };
  const details = {
    message: typeof source.message === 'string' && source.message !== '' ? source.message : 'Unknown organizer error.'
  };
  if (typeof source.code === 'string') details.code = source.code;
  if (Number.isInteger(source.status)) details.status = source.status;
  return details;
}
