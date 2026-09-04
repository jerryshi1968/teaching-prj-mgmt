import { describe, expect, it } from 'vitest';
import {
  ADAPTER_METHODS,
  OrganizerContractError,
  assertDirectoryResult,
  assertGroupSummary,
  assertGroupTree,
  assertOrganizerAdapter,
  assertProjectSummary,
  assertRepositionRequest,
  getOrganizerErrorDetails
} from '../src/index.js';

const project = { kind: 'project', id: 'alpha', name: 'Alpha', parentId: null, sortOrder: 0, updatedAt: null };
const group = { kind: 'group', id: 1, name: 'Group', parentId: null, sortOrder: 0, updatedAt: null };

describe('organizer contracts', () => {
  it('accepts canonical project, group, and directory values', () => {
    expect(assertProjectSummary(project)).toBe(project);
    expect(assertGroupSummary(group)).toBe(group);
    const directory = { projects: [project], groups: [group], breadcrumbs: [], owner: null, readOnly: false };
    expect(assertDirectoryResult(directory, { parentId: null })).toBe(directory);
  });

  it.each([
    [{ ...project, id: '' }],
    [{ ...project, id: 2 }],
    [{ ...project, sortOrder: -1 }],
    [{ ...project, sortOrder: Number.POSITIVE_INFINITY }],
    [{ ...project, parentId: '1' }],
    [{ ...project, updatedAt: 4 }]
  ])('rejects an invalid project shape', (candidate) => {
    expect(() => assertProjectSummary(candidate)).toThrow(OrganizerContractError);
  });

  it.each([
    [{ ...group, id: '1' }],
    [{ ...group, id: 0 }],
    [{ ...group, kind: 'project' }],
    [{ ...group, name: '  ' }]
  ])('rejects an invalid group shape', (candidate) => {
    expect(() => assertGroupSummary(candidate)).toThrow(OrganizerContractError);
  });

  it('does not mix project string ids with group numeric ids', () => {
    expect(() => assertProjectSummary({ ...project, id: 1 })).toThrow();
    expect(() => assertGroupSummary({ ...group, id: '1' })).toThrow();
  });

  it('rejects duplicate ids and invalid breadcrumb order', () => {
    expect(() => assertDirectoryResult({
      projects: [project, { ...project }], groups: [], breadcrumbs: [], owner: null, readOnly: false
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ITEM_ID' }));
    expect(() => assertDirectoryResult({
      projects: [], groups: [], breadcrumbs: [{ ...group, parentId: 9 }], owner: null, readOnly: false
    }, { parentId: 1 })).toThrowError(expect.objectContaining({ code: 'INVALID_BREADCRUMBS' }));
    expect(() => assertDirectoryResult({
      projects: [{ ...project, parentId: 1 }], groups: [], breadcrumbs: [], owner: null, readOnly: false
    }, { parentId: null })).toThrowError(expect.objectContaining({ code: 'INVALID_DIRECTORY' }));
  });

  it('validates complete trees for missing parents and cycles', () => {
    expect(assertGroupTree([group, { ...group, id: 2, parentId: 1 }])).toHaveLength(2);
    expect(() => assertGroupTree([{ ...group, parentId: 99 }])).toThrowError(expect.objectContaining({ code: 'INVALID_GROUP_TREE' }));
    expect(() => assertGroupTree([{ ...group, parentId: 1 }])).toThrowError(expect.objectContaining({ code: 'INVALID_GROUP_TREE' }));
  });

  it('requires all eight adapter methods', () => {
    const adapter = Object.fromEntries(ADAPTER_METHODS.map((method) => [method, () => undefined]));
    expect(assertOrganizerAdapter(adapter)).toBe(adapter);
    delete adapter.openProject;
    expect(() => assertOrganizerAdapter(adapter)).toThrowError(expect.objectContaining({ code: 'INVALID_ADAPTER' }));
  });

  it('requires explicit positioning fields', () => {
    expect(assertRepositionRequest({ kind: 'project', id: 'alpha', parentId: null, beforeId: null })).toBeTruthy();
    expect(() => assertRepositionRequest({ kind: 'project', id: 'alpha', parentId: null })).toThrow();
    expect(() => assertRepositionRequest({ kind: 'group', id: '1', parentId: null, beforeId: null })).toThrow();
  });

  it('preserves normalized error fields without relying on a subclass', () => {
    expect(getOrganizerErrorDetails(Object.assign(new TypeError('Broken'), { code: 'BAD_DATA', status: 422 })))
      .toEqual({ message: 'Broken', code: 'BAD_DATA', status: 422 });
    expect(getOrganizerErrorDetails('offline')).toEqual({ message: 'offline' });
  });
});
