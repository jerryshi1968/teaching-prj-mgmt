import {
  OrganizerContractError,
  assertDirectoryResult,
  assertGroupTree,
  assertItemKind,
  assertOrganizerAdapter,
  getOrganizerErrorDetails
} from '@tigao/organizer-contracts';
import { createMemoryOrganizerHarness, MemoryOrganizerAdapter } from './memory-adapter.js';

export { createMemoryOrganizerHarness, MemoryOrganizerAdapter };

export function runProjectOrganizerAdapterContract({ test, assert, createHarness }) {
  test('loads the current owner and an explicitly selected owner', async () => {
    const { adapter } = createHarness();
    assertOrganizerAdapter(adapter);
    const current = await adapter.loadDirectory({});
    const selected = await adapter.loadDirectory({ ownerId: 2, parentId: 20 });
    assert.equal(current.owner.id, 1);
    assert.equal(selected.owner.id, 2);
    assert.equal(selected.readOnly, true);
  });

  test('loads root and deep directories with ordered breadcrumbs', async () => {
    const { adapter } = createHarness();
    const root = await adapter.loadDirectory({ parentId: null });
    const deep = await adapter.loadDirectory({ parentId: 3 });
    assert.deepEqual(root.breadcrumbs, []);
    assert.deepEqual(deep.breadcrumbs.map((group) => group.id), [1, 2, 3]);
    assertDirectoryResult(deep, { parentId: 3 });
  });

  test('loads the complete normalized group tree', async () => {
    const { adapter } = createHarness();
    const groups = await adapter.loadAllGroups({});
    assert.equal(groups.length, 4);
    assertGroupTree(groups);
  });

  test('creates projects and groups', async () => {
    const { adapter } = createHarness();
    await adapter.loadDirectory({ parentId: 1 });
    const project = await adapter.createProject({ name: 'Created Project', parentId: 1, templateId: 'blank' });
    const group = await adapter.createGroup({ name: 'Created Group', parentId: 1 });
    assert.equal(project.parentId, 1);
    assert.equal(group.parentId, 1);
  });

  test('renames both item kinds', async () => {
    const { adapter } = createHarness();
    await adapter.loadDirectory({});
    assert.equal((await adapter.renameItem({ kind: 'project', id: 'project-root-a', name: 'Renamed Project' })).name, 'Renamed Project');
    assert.equal((await adapter.renameItem({ kind: 'group', id: 1, name: 'Renamed Group' })).name, 'Renamed Group');
  });

  test('repositions in the same directory and appends across directories', async () => {
    const { adapter } = createHarness();
    await adapter.loadDirectory({});
    await adapter.repositionItem({ kind: 'project', id: 'project-root-b', parentId: null, beforeId: 'project-root-a' });
    await adapter.repositionItem({ kind: 'project', id: 'project-root-a', parentId: 1, beforeId: null });
    const root = await adapter.loadDirectory({});
    const nested = await adapter.loadDirectory({ parentId: 1 });
    assert.deepEqual(root.projects.map((project) => project.id), ['project-root-b']);
    assert.equal(nested.projects.at(-1).id, 'project-root-a');
  });

  test('rejects moving a group into itself or a descendant', async () => {
    const { adapter } = createHarness();
    await adapter.loadDirectory({});
    await assert.rejects(
      () => adapter.repositionItem({ kind: 'group', id: 1, parentId: 3, beforeId: null }),
      (error) => error.code === 'INVALID_GROUP_MOVE'
    );
  });

  test('deletes a project and an empty group', async () => {
    const { adapter } = createHarness();
    await adapter.loadDirectory({});
    assert.deepEqual(await adapter.deleteItem({ kind: 'project', id: 'project-root-a' }), { deleted: true });
    assert.deepEqual(await adapter.deleteItem({ kind: 'group', id: 4 }), { deleted: true });
  });

  test('rejects writes for a read-only owner', async () => {
    const { adapter } = createHarness();
    await adapter.loadDirectory({ ownerId: 2, parentId: 20 });
    await assert.rejects(
      () => adapter.createGroup({ name: 'Denied', parentId: 20 }),
      (error) => error.code === 'READ_ONLY' && error.status === 403
    );
  });

  test('preserves adapter error details', async () => {
    const { adapter, controls } = createHarness();
    const original = Object.assign(new Error('Unavailable'), { code: 'OFFLINE', status: 503 });
    controls.failNext('loadDirectory', original);
    await assert.rejects(async () => {
      try {
        await adapter.loadDirectory({});
      } catch (error) {
        assert.deepEqual(getOrganizerErrorDetails(error), { message: 'Unavailable', code: 'OFFLINE', status: 503 });
        throw error;
      }
    });
  });

  test('diagnoses invalid kinds, duplicate ids, missing parents, and cycles', async () => {
    assert.throws(() => assertItemKind('unknown'), OrganizerContractError);
    const group = { kind: 'group', id: 1, name: 'One', parentId: null, sortOrder: 0, updatedAt: null };
    assert.throws(() => assertGroupTree([group, { ...group }]), OrganizerContractError);
    assert.throws(() => assertGroupTree([{ ...group, parentId: 99 }]), OrganizerContractError);
    assert.throws(() => assertGroupTree([{ ...group, parentId: 1 }]), OrganizerContractError);
  });

  test('leaves no half-completed move after a failure', async () => {
    const { adapter, controls, getState } = createHarness();
    await adapter.loadDirectory({});
    const before = getState();
    controls.failNext('repositionItem');
    await assert.rejects(() => adapter.repositionItem({
      kind: 'project', id: 'project-root-a', parentId: 1, beforeId: null
    }));
    assert.deepEqual(getState(), before);
  });
}
