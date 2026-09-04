import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  assertDirectoryResult,
  assertGroupSummary,
  assertGroupTree,
  assertOrganizerAdapter,
  assertProjectSummary,
  getOrganizerErrorDetails
} from '@tigao/organizer-contracts';
import { listMoveTargets, normalizeSortOrders } from '@tigao/organizer-core';

function itemKey(kind, id) {
  return `${kind}:${id}`;
}

function updateCollection(directory, kind, update) {
  const key = kind === 'project' ? 'projects' : 'groups';
  return { ...directory, [key]: update(directory[key]) };
}

function renumberInOrder(items) {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}

function applyLocalReposition(directory, request, currentParentId) {
  const key = request.kind === 'project' ? 'projects' : 'groups';
  const source = directory[key];
  const moving = source.find((item) => item.id === request.id);
  if (!moving) return directory;
  const remaining = source.filter((item) => item.id !== request.id);
  if (request.parentId !== currentParentId) return { ...directory, [key]: normalizeSortOrders(remaining) };
  const target = { ...moving, parentId: request.parentId };
  let insertionIndex = remaining.length;
  if (request.beforeId !== null) {
    insertionIndex = remaining.findIndex((item) => item.id === request.beforeId);
    if (insertionIndex < 0) return directory;
  }
  const next = [...remaining];
  next.splice(insertionIndex, 0, target);
  return { ...directory, [key]: renumberInOrder(next) };
}

export function useProjectOrganizer({
  adapter,
  ownerId = null,
  currentParentId = null,
  onCurrentParentIdChange,
  onError
}) {
  const validatedAdapter = useMemo(() => assertOrganizerAdapter(adapter), [adapter]);
  const [directory, setDirectory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [treeBlocked, setTreeBlocked] = useState(false);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const mountedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const directoryRef = useRef(directory);
  const pendingIdsRef = useRef(new Set());
  const contextRef = useRef({ ownerId, currentParentId });
  contextRef.current = { ownerId, currentParentId };

  useEffect(() => {
    directoryRef.current = directory;
  }, [directory]);

  useEffect(() => {
    directoryRef.current = null;
    setDirectory(null);
    setError(null);
  }, [currentParentId, ownerId]);

  const reportError = useCallback((caught) => {
    setError(getOrganizerErrorDetails(caught));
    if (caught?.code === 'INVALID_GROUP_TREE') setTreeBlocked(true);
    onError?.(caught);
  }, [onError]);

  const loadDirectory = useCallback(async () => {
    const requestSequence = ++requestSequenceRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await validatedAdapter.loadDirectory({ ownerId, parentId: currentParentId });
      assertDirectoryResult(result, { parentId: currentParentId });
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return null;
      const normalized = {
        ...result,
        groups: normalizeSortOrders(result.groups),
        projects: normalizeSortOrders(result.projects)
      };
      directoryRef.current = normalized;
      setDirectory(normalized);
      setTreeBlocked(false);
      return normalized;
    } catch (caught) {
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return null;
      reportError(caught);
      return null;
    } finally {
      if (mountedRef.current && requestSequence === requestSequenceRef.current) setLoading(false);
    }
  }, [currentParentId, ownerId, reportError, validatedAdapter]);

  useEffect(() => {
    mountedRef.current = true;
    loadDirectory();
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, [loadDirectory]);

  const markPending = useCallback((key, pending) => {
    const next = new Set(pendingIdsRef.current);
    if (pending) next.add(key);
    else next.delete(key);
    pendingIdsRef.current = next;
    setPendingIds(next);
  }, []);

  const runWrite = useCallback(async ({ key, optimistic, operation, commit }) => {
    if (treeBlocked || directoryRef.current?.readOnly || pendingIdsRef.current.has(key)) return null;
    const writeContext = contextRef.current;
    const previous = directoryRef.current;
    if (optimistic && previous) {
      const next = optimistic(previous);
      directoryRef.current = next;
      setDirectory(next);
    }
    markPending(key, true);
    setError(null);
    try {
      const result = await operation();
      if (!mountedRef.current) return result;
      if (writeContext.ownerId !== contextRef.current.ownerId || writeContext.currentParentId !== contextRef.current.currentParentId) {
        return result;
      }
      if (commit) {
        const next = commit(directoryRef.current, result);
        directoryRef.current = next;
        setDirectory(next);
      }
      return result;
    } catch (caught) {
      if (mountedRef.current) {
        const isCurrentContext = writeContext.ownerId === contextRef.current.ownerId
          && writeContext.currentParentId === contextRef.current.currentParentId;
        if (optimistic && isCurrentContext) {
          directoryRef.current = previous;
          setDirectory(previous);
        }
        if (isCurrentContext) reportError(caught);
      }
      return null;
    } finally {
      if (mountedRef.current) markPending(key, false);
    }
  }, [markPending, reportError, treeBlocked]);

  const createProject = useCallback(({ name, templateId }) => runWrite({
    key: 'create:project',
    operation: () => validatedAdapter.createProject({ name, parentId: currentParentId, templateId }),
    commit: (current, item) => {
      assertProjectSummary(item);
      return updateCollection(current, 'project', (projects) => normalizeSortOrders([...projects, item]));
    }
  }), [currentParentId, runWrite, validatedAdapter]);

  const createGroup = useCallback(({ name }) => runWrite({
    key: 'create:group',
    operation: () => validatedAdapter.createGroup({ name, parentId: currentParentId }),
    commit: (current, item) => {
      assertGroupSummary(item);
      return updateCollection(current, 'group', (groups) => normalizeSortOrders([...groups, item]));
    }
  }), [currentParentId, runWrite, validatedAdapter]);

  const renameItem = useCallback((item, name) => runWrite({
    key: itemKey(item.kind, item.id),
    operation: () => validatedAdapter.renameItem({ kind: item.kind, id: item.id, name }),
    commit: (current, updated) => {
      if (item.kind === 'project') assertProjectSummary(updated);
      else assertGroupSummary(updated);
      return updateCollection(current, item.kind, (items) => items.map((candidate) => candidate.id === item.id ? updated : candidate));
    }
  }), [runWrite, validatedAdapter]);

  const deleteItem = useCallback((item) => runWrite({
    key: itemKey(item.kind, item.id),
    optimistic: (current) => updateCollection(current, item.kind, (items) => normalizeSortOrders(items.filter((candidate) => candidate.id !== item.id))),
    operation: () => validatedAdapter.deleteItem({ kind: item.kind, id: item.id })
  }), [runWrite, validatedAdapter]);

  const repositionItem = useCallback((item, parentId, beforeId) => {
    const request = { kind: item.kind, id: item.id, parentId, beforeId };
    return runWrite({
      key: itemKey(item.kind, item.id),
      optimistic: (current) => applyLocalReposition(current, request, currentParentId),
      operation: () => validatedAdapter.repositionItem(request),
      commit: (current, response) => {
        if (response?.repositioned !== true || !response.item) return current;
        if (item.kind === 'project') assertProjectSummary(response.item);
        else assertGroupSummary(response.item);
        if (response.item.parentId !== currentParentId) return current;
        return updateCollection(current, item.kind, (items) => normalizeSortOrders(
          items.map((candidate) => candidate.id === item.id ? response.item : candidate)
        ));
      }
    });
  }, [currentParentId, runWrite, validatedAdapter]);

  const openProject = useCallback(async (id) => {
    try {
      return await validatedAdapter.openProject(id);
    } catch (caught) {
      if (mountedRef.current) reportError(caught);
      return null;
    }
  }, [reportError, validatedAdapter]);

  const loadMoveTargets = useCallback(async (item, rootName) => {
    try {
      const groups = await validatedAdapter.loadAllGroups({ ownerId });
      assertGroupTree(groups);
      return listMoveTargets(groups, item, rootName);
    } catch (caught) {
      if (mountedRef.current) reportError(caught);
      return [];
    }
  }, [ownerId, reportError, validatedAdapter]);

  const navigate = useCallback((parentId) => {
    onCurrentParentIdChange?.(parentId);
  }, [onCurrentParentIdChange]);

  return {
    directory,
    loading,
    error,
    treeBlocked,
    pendingIds,
    saving: pendingIds.size > 0,
    reload: loadDirectory,
    navigate,
    createProject,
    createGroup,
    renameItem,
    deleteItem,
    repositionItem,
    openProject,
    loadMoveTargets
  };
}
