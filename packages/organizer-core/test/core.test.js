import { describe, expect, it } from 'vitest';
import {
  applyReposition,
  buildBreadcrumbs,
  calculateDropBeforeId,
  calculateOffsetBeforeId,
  createDragId,
  formatGroupPath,
  getDescendantIds,
  listDirectory,
  listMoveTargets,
  normalizeSortOrders,
  parseDragId,
  sortSummaries,
  validateGroupTree
} from '../src/index.js';

const groups = [
  { kind: 'group', id: 1, name: 'Root A', parentId: null, sortOrder: 1, updatedAt: null },
  { kind: 'group', id: 2, name: 'Same', parentId: 1, sortOrder: 0, updatedAt: null },
  { kind: 'group', id: 3, name: 'Same', parentId: 2, sortOrder: 0, updatedAt: null },
  { kind: 'group', id: 4, name: 'Root B', parentId: null, sortOrder: 0, updatedAt: null }
];
const projects = [
  { kind: 'project', id: 'a', name: 'A', parentId: null, sortOrder: 2, updatedAt: null },
  { kind: 'project', id: 'b', name: 'B', parentId: null, sortOrder: 0, updatedAt: null },
  { kind: 'project', id: 'c', name: 'C', parentId: null, sortOrder: 0, updatedAt: null }
];

describe('organizer core', () => {
  it('sorts stably and normalizes without mutating input', () => {
    const frozen = projects.map((project) => Object.freeze({ ...project }));
    Object.freeze(frozen);
    expect(sortSummaries(frozen).map((project) => project.id)).toEqual(['b', 'c', 'a']);
    expect(normalizeSortOrders(frozen).map((project) => project.sortOrder)).toEqual([0, 1, 2]);
    expect(frozen.map((project) => project.sortOrder)).toEqual([2, 0, 0]);
  });

  it('lists root and empty directories as independent group and project sequences', () => {
    const root = listDirectory({ groups, projects }, null);
    expect(root.groups.map((group) => group.id)).toEqual([4, 1]);
    expect(root.projects.map((project) => project.id)).toEqual(['b', 'c', 'a']);
    expect(listDirectory({ groups, projects }, 99)).toEqual({ groups: [], projects: [] });
  });

  it('builds deep breadcrumbs and paths', () => {
    expect(buildBreadcrumbs(groups, null)).toEqual([]);
    expect(buildBreadcrumbs(groups, 3).map((group) => group.id)).toEqual([1, 2, 3]);
    expect(formatGroupPath(groups, 3)).toBe('Root A / Same / Same');
  });

  it('handles a very deep tree without recursive traversal', () => {
    const deep = Array.from({ length: 1500 }, (_, index) => ({
      kind: 'group', id: index + 1, name: `G${index + 1}`, parentId: index === 0 ? null : index, sortOrder: 0, updatedAt: null
    }));
    expect(buildBreadcrumbs(deep, 1500)).toHaveLength(1500);
    expect(getDescendantIds(deep, 1).size).toBe(1499);
  });

  it('diagnoses duplicate ids, missing parents, and cycles', () => {
    expect(() => validateGroupTree([groups[0], { ...groups[0] }])).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ITEM_ID' }));
    expect(() => validateGroupTree([{ ...groups[0], parentId: 99 }])).toThrowError(expect.objectContaining({ code: 'INVALID_GROUP_TREE' }));
    expect(() => validateGroupTree([
      { ...groups[0], parentId: 2 },
      { ...groups[1], parentId: 1 }
    ])).toThrowError(expect.objectContaining({ code: 'INVALID_GROUP_TREE' }));
  });

  it('computes descendants and legal move targets', () => {
    expect([...getDescendantIds(groups, 1)]).toEqual([2, 3]);
    expect(listMoveTargets(groups, { kind: 'group', id: 1 }).map((target) => target.parentId)).toEqual([null, 4]);
    expect(listMoveTargets(groups, { kind: 'project', id: 'a' })).toHaveLength(5);
  });

  it('calculates before ids for buttons, drag ordering, and append', () => {
    expect(calculateOffsetBeforeId(projects, 'c', -1)).toBe('b');
    expect(calculateOffsetBeforeId(projects, 'b', 1)).toBe('a');
    expect(calculateOffsetBeforeId(projects, 'a', 1)).toBeUndefined();
    expect(calculateDropBeforeId(projects, 'a', 'b')).toBe('b');
    expect(calculateDropBeforeId(projects, 'b', 'a', 'after')).toBeNull();
  });

  it('applies same-directory and cross-directory moves immutably', () => {
    const snapshot = { groups, projects };
    const sameDirectory = applyReposition(snapshot, { kind: 'project', id: 'a', parentId: null, beforeId: 'b' });
    expect(sameDirectory.projects.filter((project) => project.parentId === null).map((project) => project.id)).toEqual(['a', 'b', 'c']);
    expect(sameDirectory.projects.map((project) => project.sortOrder).sort()).toEqual([0, 1, 2]);
    const crossDirectory = applyReposition(snapshot, { kind: 'project', id: 'b', parentId: 1, beforeId: null });
    expect(crossDirectory.projects.find((project) => project.id === 'b').parentId).toBe(1);
    expect(snapshot.projects.find((project) => project.id === 'b').parentId).toBeNull();
  });

  it('prevents moving a group into itself or a descendant', () => {
    expect(() => applyReposition({ groups, projects }, { kind: 'group', id: 1, parentId: 3, beforeId: null }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_GROUP_MOVE' }));
  });

  it('creates reversible collision-free drag ids and rejects malformed input', () => {
    expect(parseDragId(createDragId('project', '1:a/b'))).toEqual({ kind: 'project', id: '1:a/b' });
    expect(parseDragId(createDragId('group', 1))).toEqual({ kind: 'group', id: 1 });
    expect(createDragId('project', '1')).not.toBe(createDragId('group', 1));
    expect(() => parseDragId('group:not-a-number')).toThrowError(expect.objectContaining({ code: 'INVALID_DRAG_ID' }));
  });
});
