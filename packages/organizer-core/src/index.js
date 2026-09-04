import {
  OrganizerContractError,
  assertGroupTree,
  assertItemKind,
  assertRepositionRequest
} from '@tigao/organizer-contracts';

function sameId(left, right) {
  return left === right;
}

function sameParent(left, right) {
  return left === right;
}

export function compareSummaries(left, right) {
  return left.sortOrder - right.sortOrder;
}

export function sortSummaries(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => compareSummaries(left.item, right.item) || left.index - right.index)
    .map(({ item }) => item);
}

export function normalizeSortOrders(items) {
  return sortSummaries(items).map((item, index) => ({ ...item, sortOrder: index }));
}

export function listDirectory(snapshot, parentId = null) {
  return {
    groups: normalizeSortOrders(snapshot.groups.filter((group) => sameParent(group.parentId, parentId))),
    projects: normalizeSortOrders(snapshot.projects.filter((project) => sameParent(project.parentId, parentId)))
  };
}

export function validateGroupTree(groups) {
  assertGroupTree(groups);
  return new Map(groups.map((group) => [group.id, group]));
}

export function buildBreadcrumbs(groups, parentId = null) {
  const byId = validateGroupTree(groups);
  if (parentId === null) return [];
  if (!byId.has(parentId)) {
    throw new OrganizerContractError(`Group ${parentId} does not exist.`, 'INVALID_GROUP_TREE');
  }
  const reversed = [];
  let currentId = parentId;
  while (currentId !== null) {
    const group = byId.get(currentId);
    reversed.push(group);
    currentId = group.parentId;
  }
  return reversed.reverse();
}

export function getDescendantIds(groups, groupId) {
  const byId = validateGroupTree(groups);
  if (!byId.has(groupId)) {
    throw new OrganizerContractError(`Group ${groupId} does not exist.`, 'INVALID_GROUP_TREE');
  }
  const children = new Map();
  for (const group of groups) {
    if (group.parentId === null) continue;
    const siblingList = children.get(group.parentId) ?? [];
    siblingList.push(group.id);
    children.set(group.parentId, siblingList);
  }
  const descendants = new Set();
  const queue = [...(children.get(groupId) ?? [])];
  for (let index = 0; index < queue.length; index += 1) {
    const childId = queue[index];
    if (descendants.has(childId)) continue;
    descendants.add(childId);
    queue.push(...(children.get(childId) ?? []));
  }
  return descendants;
}

export function formatGroupPath(groups, groupId, separator = ' / ') {
  return buildBreadcrumbs(groups, groupId).map((group) => group.name).join(separator);
}

export function listMoveTargets(groups, item = { kind: 'project', id: '' }, rootName = 'Root') {
  validateGroupTree(groups);
  assertItemKind(item.kind);
  const excluded = item.kind === 'group'
    ? new Set([item.id, ...getDescendantIds(groups, item.id)])
    : new Set();
  const targets = [{ parentId: null, name: rootName, path: rootName, group: null }];
  for (const group of groups) {
    if (excluded.has(group.id)) continue;
    targets.push({
      parentId: group.id,
      name: group.name,
      path: formatGroupPath(groups, group.id),
      group
    });
  }
  return targets.sort((left, right) => {
    if (left.parentId === null) return -1;
    if (right.parentId === null) return 1;
    return left.path.localeCompare(right.path) || left.parentId - right.parentId;
  });
}

export function calculateOffsetBeforeId(items, itemId, offset) {
  if (!Number.isInteger(offset)) throw new TypeError('offset must be an integer.');
  const ordered = sortSummaries(items);
  const currentIndex = ordered.findIndex((item) => sameId(item.id, itemId));
  if (currentIndex < 0) throw new OrganizerContractError(`Item ${itemId} does not exist.`, 'ITEM_NOT_FOUND');
  const targetIndex = Math.max(0, Math.min(ordered.length - 1, currentIndex + offset));
  if (targetIndex === currentIndex) return undefined;
  const remaining = ordered.filter((item) => !sameId(item.id, itemId));
  return remaining[targetIndex]?.id ?? null;
}

export function calculateDropBeforeId(items, activeId, overId, edge = 'before') {
  const ordered = sortSummaries(items);
  if (!ordered.some((item) => sameId(item.id, activeId))) {
    throw new OrganizerContractError(`Item ${activeId} does not exist.`, 'ITEM_NOT_FOUND');
  }
  const remaining = ordered.filter((item) => !sameId(item.id, activeId));
  const overIndex = remaining.findIndex((item) => sameId(item.id, overId));
  if (overIndex < 0) throw new OrganizerContractError(`Target ${overId} does not exist.`, 'ITEM_NOT_FOUND');
  const insertionIndex = overIndex + (edge === 'after' ? 1 : 0);
  return remaining[insertionIndex]?.id ?? null;
}

function itemMatches(item, kind, id) {
  return item.kind === kind && sameId(item.id, id);
}

function normalizeDirectory(collection, parentId) {
  const siblings = normalizeSortOrders(collection.filter((item) => sameParent(item.parentId, parentId)));
  const sortOrderById = new Map(siblings.map((item) => [item.id, item.sortOrder]));
  return collection.map((item) => sameParent(item.parentId, parentId)
    ? { ...item, sortOrder: sortOrderById.get(item.id) }
    : item);
}

export function applyReposition(snapshot, request) {
  assertRepositionRequest(request);
  const source = request.kind === 'project' ? snapshot.projects : snapshot.groups;
  const item = source.find((candidate) => itemMatches(candidate, request.kind, request.id));
  if (!item) throw new OrganizerContractError(`Item ${request.id} does not exist.`, 'ITEM_NOT_FOUND');
  if (request.beforeId !== null && sameId(request.beforeId, request.id)) {
    throw new OrganizerContractError('An item cannot be positioned before itself.', 'INVALID_REPOSITION');
  }

  if (request.kind === 'group' && request.parentId !== null) {
    const descendants = getDescendantIds(snapshot.groups, request.id);
    if (request.parentId === request.id || descendants.has(request.parentId)) {
      throw new OrganizerContractError('A group cannot be moved into itself or a descendant.', 'INVALID_GROUP_MOVE');
    }
  }

  const remaining = source.filter((candidate) => !itemMatches(candidate, request.kind, request.id));
  const targetSiblings = sortSummaries(remaining.filter((candidate) => sameParent(candidate.parentId, request.parentId)));
  let insertionIndex = targetSiblings.length;
  if (request.beforeId !== null) {
    insertionIndex = targetSiblings.findIndex((candidate) => sameId(candidate.id, request.beforeId));
    if (insertionIndex < 0) {
      throw new OrganizerContractError('beforeId must identify a same-kind sibling in the target directory.', 'INVALID_REPOSITION');
    }
  }

  targetSiblings.splice(insertionIndex, 0, { ...item, parentId: request.parentId });
  const targetIds = new Set(targetSiblings.map((candidate) => candidate.id));
  let updated = remaining.filter((candidate) => !targetIds.has(candidate.id));
  updated.push(...targetSiblings.map((candidate, index) => ({ ...candidate, sortOrder: index })));
  updated = normalizeDirectory(updated, item.parentId);

  return request.kind === 'project'
    ? { ...snapshot, projects: updated }
    : { ...snapshot, groups: updated };
}

export function createDragId(kind, id) {
  assertItemKind(kind);
  if (kind === 'project' && (typeof id !== 'string' || id === '')) {
    throw new OrganizerContractError('A project drag id requires a non-empty string id.', 'INVALID_DRAG_ID');
  }
  if (kind === 'group' && (!Number.isInteger(id) || id <= 0)) {
    throw new OrganizerContractError('A group drag id requires a positive integer id.', 'INVALID_DRAG_ID');
  }
  return `${kind}:${encodeURIComponent(String(id))}`;
}

export function parseDragId(dragId) {
  if (typeof dragId !== 'string') {
    throw new OrganizerContractError('Drag id must be a string.', 'INVALID_DRAG_ID');
  }
  const separatorIndex = dragId.indexOf(':');
  if (separatorIndex < 1) throw new OrganizerContractError('Drag id is malformed.', 'INVALID_DRAG_ID');
  const kind = dragId.slice(0, separatorIndex);
  assertItemKind(kind);
  let rawId;
  try {
    rawId = decodeURIComponent(dragId.slice(separatorIndex + 1));
  } catch {
    throw new OrganizerContractError('Drag id is malformed.', 'INVALID_DRAG_ID');
  }
  if (kind === 'project' && rawId !== '') return { kind, id: rawId };
  if (kind === 'group' && /^[1-9]\d*$/.test(rawId)) return { kind, id: Number(rawId) };
  throw new OrganizerContractError('Drag id is malformed.', 'INVALID_DRAG_ID');
}
