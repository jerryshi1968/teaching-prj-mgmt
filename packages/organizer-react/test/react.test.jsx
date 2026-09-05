// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const dndMocks = vi.hoisted(() => ({
  context: null,
  closestCenter: vi.fn(() => []),
  pointerWithin: vi.fn(() => []),
  rectIntersection: vi.fn(() => [])
}));

const sortableMocks = vi.hoisted(() => ({
  rectSortingStrategy: vi.fn()
}));

vi.mock('@dnd-kit/core', async () => {
  const ReactModule = await import('react');
  return {
    DndContext: ({ children, onDragStart, onDragCancel, onDragEnd, ...context }) => {
      dndMocks.context = { onDragStart, onDragCancel, onDragEnd, ...context };
      return ReactModule.createElement(
        ReactModule.Fragment,
        null,
        children,
        ReactModule.createElement('button', {
          type: 'button',
          'data-testid': 'simulate-project-drag',
          onClick: () => onDragEnd({
            active: { data: { current: { type: 'item', kind: 'project', id: 'project-root-b', parentId: null } } },
            over: { data: { current: { type: 'item', kind: 'project', id: 'project-root-a', parentId: null } } }
          })
        }, 'Simulate project drag'),
        ReactModule.createElement('button', {
          type: 'button',
          'data-testid': 'simulate-deep-project-drag-start',
          onClick: () => onDragStart({
            active: { id: 'project:project-deep', data: { current: { type: 'item', kind: 'project', id: 'project-deep', parentId: 3 } } }
          })
        }, 'Simulate deep project drag start'),
        ReactModule.createElement('button', {
          type: 'button',
          'data-testid': 'simulate-deep-project-root-drop',
          onClick: () => onDragEnd({
            active: { id: 'project:project-deep', data: { current: { type: 'item', kind: 'project', id: 'project-deep', parentId: 3 } } },
            over: { id: 'container:root', data: { current: { type: 'container', parentId: null } } }
          })
        }, 'Simulate deep project root drop'),
        ReactModule.createElement('button', {
          type: 'button',
          'data-testid': 'simulate-drag-cancel',
          onClick: onDragCancel
        }, 'Simulate drag cancel')
      );
    },
    DragOverlay: ({ children }) => ReactModule.createElement(ReactModule.Fragment, null, children),
    KeyboardSensor: function KeyboardSensor() {},
    MouseSensor: function MouseSensor() {},
    TouchSensor: function TouchSensor() {},
    closestCenter: dndMocks.closestCenter,
    pointerWithin: dndMocks.pointerWithin,
    rectIntersection: dndMocks.rectIntersection,
    useDroppable: () => ({ isOver: false, setNodeRef: () => undefined }),
    useSensor: () => ({}),
    useSensors: (...sensors) => sensors
  };
});

vi.mock('@dnd-kit/sortable', async () => {
  const ReactModule = await import('react');
  return {
    SortableContext: ({ children, strategy }) => ReactModule.createElement(
      'div',
      { 'data-testid': 'sortable-context', 'data-strategy': strategy === sortableMocks.rectSortingStrategy ? 'rect' : 'other' },
      children
    ),
    rectSortingStrategy: sortableMocks.rectSortingStrategy,
    sortableKeyboardCoordinates: () => undefined,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => undefined,
      transform: null,
      transition: undefined,
      isDragging: false
    })
  };
});

vi.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => undefined } } }));

import { createMemoryOrganizerHarness } from '@tigao/organizer-contract-tests';
import { ProjectOrganizer, useProjectOrganizer } from '../src/index.js';

afterEach(() => {
  cleanup();
  dndMocks.context = null;
  dndMocks.closestCenter.mockReset().mockReturnValue([]);
  dndMocks.pointerWithin.mockReset().mockReturnValue([]);
  dndMocks.rectIntersection.mockReset().mockReturnValue([]);
});

function ControlledOrganizer({ adapter, initialOwnerId = null, initialParentId = null, onError }) {
  const [ownerId] = React.useState(initialOwnerId);
  const [parentId, setParentId] = React.useState(initialParentId);
  return (
    <ProjectOrganizer
      adapter={adapter}
      ownerId={ownerId}
      currentParentId={parentId}
      onCurrentParentIdChange={setParentId}
      onError={onError}
      renderProjectExtraActions={(project) => <button type="button">Extra {project.name}</button>}
    />
  );
}

describe('ProjectOrganizer', () => {
  it('renders loading data, groups before projects, and accessible action names', async () => {
    const { adapter } = createMemoryOrganizerHarness();
    render(<ControlledOrganizer adapter={adapter} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects');
    await screen.findByText('First Project');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['Groups', 'Projects']);
    expect(screen.getByRole('button', { name: 'Rename: First Project' })).toHaveAttribute('title', 'Rename: First Project');
    expect(screen.getByRole('button', { name: 'Move up: First Project' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Extra First Project' })).toBeVisible();
  });

  it('navigates through a group and the root breadcrumb and opens a project', async () => {
    const { adapter, getOpenedProjects } = createMemoryOrganizerHarness();
    const user = userEvent.setup();
    render(<ControlledOrganizer adapter={adapter} />);
    await user.click(await screen.findByText('Lessons'));
    expect(await screen.findByText('Week One')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'All projects' }));
    await user.click(await screen.findByText('First Project'));
    await waitFor(() => expect(getOpenedProjects()).toEqual(['project-root-a']));
  });

  it('creates, renames, moves, and deletes through the adapter', async () => {
    const harness = createMemoryOrganizerHarness();
    const user = userEvent.setup();
    render(<ControlledOrganizer adapter={harness.adapter} />);
    await screen.findByText('First Project');

    await user.type(screen.getByLabelText('Project name'), 'New Project');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('New Project')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Rename: First Project' }));
    let dialog = screen.getByRole('dialog');
    const renameInput = within(dialog).getByLabelText('Rename');
    await user.clear(renameInput);
    await user.type(renameInput, 'Changed Project');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Changed Project')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Move: Changed Project' }));
    dialog = screen.getByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: 'Lessons' }));
    await waitFor(() => {
      const moved = harness.getState().projects.find((project) => project.id === 'project-root-a');
      expect(moved.parentId).toBe(1);
    });

    await user.click(screen.getByRole('button', { name: 'Delete: Second Project' }));
    dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(harness.getState().projects.some((project) => project.id === 'project-root-b')).toBe(false));
  });

  it('renders empty, read-only, and adapter error states', async () => {
    const harness = createMemoryOrganizerHarness();
    const onError = vi.fn();
    harness.controls.failNext('loadDirectory', Object.assign(new Error('No connection'), { code: 'OFFLINE' }));
    const { unmount } = render(<ControlledOrganizer adapter={harness.adapter} onError={onError} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection');
    expect(onError).toHaveBeenCalledOnce();
    unmount();

    render(<ControlledOrganizer adapter={createMemoryOrganizerHarness().adapter} initialOwnerId={2} initialParentId={20} />);
    expect(await screen.findByText('This collection is read-only.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Create project' })).not.toBeInTheDocument();
  });

  it('rolls back an optimistic failure and forwards the original error', async () => {
    const harness = createMemoryOrganizerHarness();
    const onError = vi.fn();
    const user = userEvent.setup();
    render(<ControlledOrganizer adapter={harness.adapter} onError={onError} />);
    await screen.findByText('First Project');
    harness.controls.failNext('deleteItem', Object.assign(new Error('Delete denied'), { code: 'DENIED', status: 409 }));
    await user.click(screen.getByRole('button', { name: 'Delete: First Project' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete denied');
    expect(screen.getByRole('button', { name: /First Project.*Open/ })).toBeVisible();
    expect(onError.mock.calls[0][0]).toMatchObject({ code: 'DENIED', status: 409 });
  });

  it('renders an explicit empty-directory state', async () => {
    const seed = {
      owners: [{ id: 1, username: 'empty-user', readOnly: false }],
      groups: [],
      projects: []
    };
    render(<ControlledOrganizer adapter={createMemoryOrganizerHarness(seed).adapter} />);
    expect(await screen.findByText('This group is empty.')).toBeVisible();
  });

  it('maps a drag result to one canonical reposition call', async () => {
    const harness = createMemoryOrganizerHarness();
    const reposition = vi.spyOn(harness.adapter, 'repositionItem');
    render(<ControlledOrganizer adapter={harness.adapter} />);
    await screen.findByText('First Project');
    fireEvent.click(screen.getByTestId('simulate-project-drag'));
    await waitFor(() => expect(reposition).toHaveBeenCalledTimes(1));
    expect(reposition).toHaveBeenCalledWith({
      kind: 'project', id: 'project-root-b', parentId: null, beforeId: 'project-root-a'
    });
  });

  it('uses rectangular sorting for card grids and prioritizes explicit pointer containers', async () => {
    const { adapter } = createMemoryOrganizerHarness();
    render(<ControlledOrganizer adapter={adapter} />);
    await screen.findByText('First Project');
    expect(screen.getAllByTestId('sortable-context').map((context) => context.dataset.strategy)).toEqual(['rect', 'rect']);

    const sortableCollision = { id: 'project:project-root-a' };
    const breadcrumbCollision = { id: 'container:breadcrumb:1' };
    dndMocks.pointerWithin.mockReturnValue([sortableCollision, breadcrumbCollision]);
    expect(dndMocks.context.collisionDetection({
      active: { id: 'project:project-root-b' },
      pointerCoordinates: { x: 12, y: 8 }
    })).toEqual([breadcrumbCollision]);

    const groupCollision = { id: 'group:1' };
    dndMocks.closestCenter.mockReturnValue([groupCollision, sortableCollision]);
    expect(dndMocks.context.collisionDetection({
      active: { id: 'project:project-root-b' },
      pointerCoordinates: null
    })).toEqual([sortableCollision]);
  });

  it('shows valid breadcrumb targets during a drag and moves an item to the root breadcrumb', async () => {
    const harness = createMemoryOrganizerHarness();
    const reposition = vi.spyOn(harness.adapter, 'repositionItem');
    render(<ControlledOrganizer adapter={harness.adapter} initialParentId={3} />);
    await screen.findByText('Deep Project');

    fireEvent.click(screen.getByTestId('simulate-deep-project-drag-start'));
    expect(screen.getByRole('button', { name: 'All projects' })).toHaveClass('tigao-organizer__breadcrumb--drop-enabled');
    expect(screen.getByRole('button', { name: 'Lessons' })).toHaveClass('tigao-organizer__breadcrumb--drop-enabled');
    expect(screen.getByRole('button', { name: 'Exercises' })).not.toHaveClass('tigao-organizer__breadcrumb--drop-enabled');
    expect(document.querySelector('.tigao-organizer__drag-overlay strong')).toHaveTextContent('Deep Project');

    fireEvent.click(screen.getByTestId('simulate-deep-project-root-drop'));
    await waitFor(() => expect(reposition).toHaveBeenCalledWith({
      kind: 'project', id: 'project-deep', parentId: null, beforeId: null
    }));
    expect(document.querySelector('.tigao-organizer__drag-overlay')).not.toBeInTheDocument();
  });
});

describe('useProjectOrganizer request races', () => {
  it('ignores an older directory response after the controlled directory changes', async () => {
    const requests = [];
    const adapter = {
      loadDirectory: ({ parentId }) => new Promise((resolve) => requests.push({ parentId, resolve })),
      loadAllGroups: vi.fn(),
      createProject: vi.fn(),
      createGroup: vi.fn(),
      renameItem: vi.fn(),
      repositionItem: vi.fn(),
      deleteItem: vi.fn(),
      openProject: vi.fn()
    };
    const { result, rerender } = renderHook(
      ({ parentId }) => useProjectOrganizer({ adapter, currentParentId: parentId }),
      { initialProps: { parentId: null } }
    );
    rerender({ parentId: 1 });
    const group = { kind: 'group', id: 1, name: 'One', parentId: null, sortOrder: 0, updatedAt: null };
    await act(async () => requests.find((request) => request.parentId === 1).resolve({
      projects: [], groups: [], breadcrumbs: [group], owner: null, readOnly: false
    }));
    await act(async () => requests.find((request) => request.parentId === null).resolve({
      projects: [{ kind: 'project', id: 'stale', name: 'Stale', parentId: null, sortOrder: 0, updatedAt: null }],
      groups: [], breadcrumbs: [], owner: null, readOnly: false
    }));
    expect(result.current.directory.breadcrumbs.map((item) => item.id)).toEqual([1]);
    expect(result.current.directory.projects).toEqual([]);
  });

  it('synchronously rejects a duplicate write for the same item', async () => {
    let finishRename;
    const adapter = {
      loadDirectory: async () => ({
        projects: [{ kind: 'project', id: 'one', name: 'One', parentId: null, sortOrder: 0, updatedAt: null }],
        groups: [], breadcrumbs: [], owner: null, readOnly: false
      }),
      loadAllGroups: vi.fn(),
      createProject: vi.fn(),
      createGroup: vi.fn(),
      renameItem: vi.fn(() => new Promise((resolve) => { finishRename = resolve; })),
      repositionItem: vi.fn(),
      deleteItem: vi.fn(),
      openProject: vi.fn()
    };
    const { result } = renderHook(() => useProjectOrganizer({ adapter, currentParentId: null }));
    await waitFor(() => expect(result.current.directory).not.toBeNull());
    const item = result.current.directory.projects[0];
    let first;
    let second;
    act(() => {
      first = result.current.renameItem(item, 'First');
      second = result.current.renameItem(item, 'Second');
    });
    await expect(second).resolves.toBeNull();
    expect(adapter.renameItem).toHaveBeenCalledOnce();
    await act(async () => finishRename({ ...item, name: 'First' }));
    await expect(first).resolves.toMatchObject({ name: 'First' });
  });

  it('updates the visible order after a canonical reposition succeeds', async () => {
    const harness = createMemoryOrganizerHarness();
    const { result } = renderHook(() => useProjectOrganizer({ adapter: harness.adapter, currentParentId: null }));
    await waitFor(() => expect(result.current.directory).not.toBeNull());
    const second = result.current.directory.projects.find((project) => project.id === 'project-root-b');
    await act(async () => {
      await result.current.repositionItem(second, null, 'project-root-a');
    });
    expect(result.current.directory.projects.map((project) => project.id)).toEqual(['project-root-b', 'project-root-a']);
  });
});
