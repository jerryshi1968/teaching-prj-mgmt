import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  calculateDropBeforeId,
  calculateOffsetBeforeId,
  createDragId,
  parseDragId,
  sortSummaries
} from '@tigao/organizer-core';
import { useProjectOrganizer } from './use-project-organizer.js';

const defaultMessages = {
  title: 'Projects',
  root: 'All projects',
  groups: 'Groups',
  projects: 'Projects',
  createGroup: 'Create group',
  createProject: 'Create project',
  groupName: 'Group name',
  projectName: 'Project name',
  open: 'Open',
  rename: 'Rename',
  move: 'Move',
  delete: 'Delete',
  moveUp: 'Move up',
  moveDown: 'Move down',
  drag: 'Drag to reorder or move',
  dropInside: 'Drop inside this group',
  loading: 'Loading projects…',
  loadingTargets: 'Loading destinations…',
  empty: 'This group is empty.',
  readOnly: 'This collection is read-only.',
  saving: 'Saving changes…',
  retry: 'Retry',
  cancel: 'Cancel',
  confirm: 'Confirm',
  renameTitle: 'Rename item',
  moveTitle: 'Move item',
  deleteTitle: 'Delete item',
  deleteQuestion: 'Delete this item?',
  chooseDestination: 'Choose a destination',
  structureBlocked: 'Editing is disabled because the group structure is invalid.',
  noDestinations: 'No valid destinations are available.'
};

function renderIcon(icons, name, fallback) {
  const icon = icons?.[name];
  if (typeof icon === 'function') return icon({ 'aria-hidden': true });
  return icon ?? <span aria-hidden="true">{fallback}</span>;
}

function parseContainerParentId(dropId) {
  if (dropId === 'container:root') return null;
  const match = /^container:(?:group|breadcrumb):([1-9]\d*)$/.exec(dropId);
  return match ? Number(match[1]) : undefined;
}

function organizerCollisionDetection(args) {
  if (!args.pointerCoordinates) {
    const closestCollisions = closestCenter(args);
    let activeIdentity;
    try {
      activeIdentity = parseDragId(String(args.active.id));
    } catch {
      return closestCollisions;
    }
    const sortableCollision = closestCollisions.find((collision) => {
      try {
        return parseDragId(String(collision.id)).kind === activeIdentity.kind;
      } catch {
        return false;
      }
    });
    return sortableCollision ? [sortableCollision] : closestCollisions;
  }

  const pointerCollisions = pointerWithin(args);
  const containerCollision = pointerCollisions.find((collision) => String(collision.id).startsWith('container:'));
  if (containerCollision) return [containerCollision];
  if (pointerCollisions.length > 0) return pointerCollisions;

  const intersectingCollisions = rectIntersection(args);
  if (intersectingCollisions.length > 0) return intersectingCollisions;
  return closestCenter(args);
}

function IconButton({ label, icon, onClick, disabled = false, className = '', ...buttonProps }) {
  return (
    <button
      type="button"
      className={`tigao-organizer__icon-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      {...buttonProps}
    >
      {icon}
    </button>
  );
}

function GroupNestTarget({ group, messages, enabled }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `container:group:${group.id}`,
    data: { type: 'container', parentId: group.id },
    disabled: !enabled
  });
  if (!enabled) return null;
  return (
    <div
      ref={setNodeRef}
      className={`tigao-organizer__nest-target${isOver ? ' tigao-organizer__nest-target--over' : ''}`}
    >
      {messages.dropInside}
    </div>
  );
}

function SortableCard({
  item,
  items,
  index,
  messages,
  icons,
  readOnly,
  disabled,
  onOpen,
  onRename,
  onMove,
  onDelete,
  onReposition,
  activeDrag,
  renderProjectExtraActions,
  renderProjectHostActions
}) {
  const dragId = createDragId(item.kind, item.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragId,
    data: { type: 'item', kind: item.kind, id: item.id, parentId: item.parentId },
    disabled: readOnly || disabled
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const projectHostActions = item.kind === 'project'
    ? renderProjectHostActions?.(item, { readOnly })
    : null;

  const moveBy = (offset) => {
    const beforeId = calculateOffsetBeforeId(items, item.id, offset);
    if (beforeId !== undefined) onReposition(item, item.parentId, beforeId);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`tigao-organizer__card tigao-organizer__card--${item.kind}${isDragging ? ' tigao-organizer__card--dragging' : ''}`}
      aria-busy={disabled || undefined}
    >
      <button type="button" className="tigao-organizer__item-main" onClick={() => onOpen(item)}>
        <span className="tigao-organizer__item-symbol">
          {renderIcon(icons, item.kind, item.kind === 'group' ? '▰' : '◇')}
        </span>
        <span className="tigao-organizer__item-copy">
          <strong>{item.name}</strong>
          {item.updatedAt && <small>{item.updatedAt}</small>}
        </span>
        <span className="tigao-organizer__open-label">{messages.open}</span>
      </button>
      {item.kind === 'group' && (
        <GroupNestTarget
          group={item}
          messages={messages}
          enabled={Boolean(activeDrag) && !disabled && !(activeDrag.kind === 'group' && activeDrag.id === item.id)}
        />
      )}
      {!readOnly && (
        <div className="tigao-organizer__card-actions">
          <IconButton
            label={`${messages.drag}: ${item.name}`}
            icon={renderIcon(icons, 'drag', '⠿')}
            disabled={disabled}
            className="tigao-organizer__drag-handle"
            {...attributes}
            {...listeners}
          />
          <IconButton
            label={`${messages.moveUp}: ${item.name}`}
            icon={renderIcon(icons, 'up', '↑')}
            disabled={disabled || index === 0}
            onClick={() => moveBy(-1)}
          />
          <IconButton
            label={`${messages.moveDown}: ${item.name}`}
            icon={renderIcon(icons, 'down', '↓')}
            disabled={disabled || index === items.length - 1}
            onClick={() => moveBy(1)}
          />
          <IconButton
            label={`${messages.rename}: ${item.name}`}
            icon={renderIcon(icons, 'rename', '✎')}
            disabled={disabled}
            onClick={() => onRename(item)}
          />
          <IconButton
            label={`${messages.move}: ${item.name}`}
            icon={renderIcon(icons, 'move', '↗')}
            disabled={disabled}
            onClick={() => onMove(item)}
          />
          <IconButton
            label={`${messages.delete}: ${item.name}`}
            icon={renderIcon(icons, 'delete', '×')}
            disabled={disabled}
            onClick={() => onDelete(item)}
          />
          {item.kind === 'project' && renderProjectExtraActions?.(item)}
          {projectHostActions}
        </div>
      )}
      {readOnly && projectHostActions && (
        <div className="tigao-organizer__card-actions">
          {projectHostActions}
        </div>
      )}
    </article>
  );
}

function BreadcrumbButton({ parentId, children, onNavigate, active = false, dropEnabled = false }) {
  const { isOver, setNodeRef } = useDroppable({
    id: parentId === null ? 'container:root' : `container:breadcrumb:${parentId}`,
    data: { type: 'container', parentId },
    disabled: !dropEnabled
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`tigao-organizer__breadcrumb${dropEnabled ? ' tigao-organizer__breadcrumb--drop-enabled' : ''}${isOver ? ' tigao-organizer__breadcrumb--over' : ''}`}
      onClick={() => onNavigate(parentId)}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </button>
  );
}

function CreateForms({ messages, onCreateGroup, onCreateProject, saving }) {
  const groupInputId = useId();
  const projectInputId = useId();
  const [groupName, setGroupName] = useState('');
  const [projectName, setProjectName] = useState('');

  const submitGroup = async (event) => {
    event.preventDefault();
    if (!groupName.trim()) return;
    const created = await onCreateGroup({ name: groupName.trim() });
    if (created) setGroupName('');
  };
  const submitProject = async (event) => {
    event.preventDefault();
    if (!projectName.trim()) return;
    const created = await onCreateProject({ name: projectName.trim() });
    if (created) setProjectName('');
  };

  return (
    <div className="tigao-organizer__create-panel">
      <form onSubmit={submitGroup} className="tigao-organizer__create-form">
        <label htmlFor={groupInputId}>{messages.groupName}</label>
        <div>
          <input id={groupInputId} value={groupName} onChange={(event) => setGroupName(event.target.value)} disabled={saving} />
          <button type="submit" disabled={saving || !groupName.trim()}>{messages.createGroup}</button>
        </div>
      </form>
      <form onSubmit={submitProject} className="tigao-organizer__create-form">
        <label htmlFor={projectInputId}>{messages.projectName}</label>
        <div>
          <input id={projectInputId} value={projectName} onChange={(event) => setProjectName(event.target.value)} disabled={saving} />
          <button type="submit" disabled={saving || !projectName.trim()}>{messages.createProject}</button>
        </div>
      </form>
    </div>
  );
}

function OrganizerDialog({ modal, messages, pending, onClose, onRename, onMove, onDelete, loadMoveTargets }) {
  const inputId = useId();
  const [name, setName] = useState(modal.item.name);
  const [targets, setTargets] = useState([]);
  const [targetsLoading, setTargetsLoading] = useState(false);

  useEffect(() => {
    let current = true;
    if (modal.type !== 'move') return () => { current = false; };
    setTargetsLoading(true);
    loadMoveTargets(modal.item, messages.root).then((loaded) => {
      if (current) setTargets(loaded);
    }).finally(() => {
      if (current) setTargetsLoading(false);
    });
    return () => { current = false; };
  }, [loadMoveTargets, messages.root, modal.item, modal.type]);

  const submitRename = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    const result = await onRename(modal.item, name.trim());
    if (result) onClose();
  };
  const submitDelete = async () => {
    const result = await onDelete(modal.item);
    if (result) onClose();
  };
  const submitMove = async (parentId) => {
    const result = await onMove(modal.item, parentId, null);
    if (result) onClose();
  };

  const title = modal.type === 'rename'
    ? messages.renameTitle
    : modal.type === 'move'
      ? messages.moveTitle
      : messages.deleteTitle;

  return (
    <div className="tigao-organizer__dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}>
      <div className="tigao-organizer__dialog" role="dialog" aria-modal="true" aria-labelledby={`${inputId}-title`}>
        <h2 id={`${inputId}-title`}>{title}</h2>
        {modal.type === 'rename' && (
          <form onSubmit={submitRename}>
            <label htmlFor={inputId}>{messages.rename}</label>
            <input id={inputId} autoFocus value={name} onChange={(event) => setName(event.target.value)} disabled={pending} />
            <div className="tigao-organizer__dialog-actions">
              <button type="button" onClick={onClose} disabled={pending}>{messages.cancel}</button>
              <button type="submit" disabled={pending || !name.trim()}>{messages.confirm}</button>
            </div>
          </form>
        )}
        {modal.type === 'move' && (
          <div>
            <p>{messages.chooseDestination}</p>
            {targetsLoading && <p role="status">{messages.loadingTargets}</p>}
            {!targetsLoading && targets.length === 0 && <p>{messages.noDestinations}</p>}
            <div className="tigao-organizer__destination-list">
              {targets.map((target) => (
                <button
                  type="button"
                  key={target.parentId ?? 'root'}
                  disabled={pending || target.parentId === modal.item.parentId}
                  onClick={() => submitMove(target.parentId)}
                >
                  {target.path}
                </button>
              ))}
            </div>
            <div className="tigao-organizer__dialog-actions">
              <button type="button" onClick={onClose} disabled={pending}>{messages.cancel}</button>
            </div>
          </div>
        )}
        {modal.type === 'delete' && (
          <div>
            <p>{messages.deleteQuestion} <strong>{modal.item.name}</strong></p>
            <div className="tigao-organizer__dialog-actions">
              <button type="button" onClick={onClose} disabled={pending}>{messages.cancel}</button>
              <button type="button" className="tigao-organizer__danger" onClick={submitDelete} disabled={pending}>{messages.delete}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ProjectOrganizer({
  adapter,
  ownerId = null,
  currentParentId = null,
  onCurrentParentIdChange,
  messages: messageOverrides,
  icons,
  onError,
  renderProjectExtraActions,
  renderProjectHostActions
}) {
  const messages = useMemo(() => ({ ...defaultMessages, ...messageOverrides }), [messageOverrides]);
  const organizer = useProjectOrganizer({ adapter, ownerId, currentParentId, onCurrentParentIdChange, onError });
  const [modal, setModal] = useState(null);
  const [activeDrag, setActiveDrag] = useState(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => setModal(null), [currentParentId, ownerId]);

  const directory = organizer.directory;
  const handleOpen = (item) => {
    if (item.kind === 'group') organizer.navigate(item.id);
    else organizer.openProject(item.id);
  };
  const handleDragStart = ({ active }) => {
    if (!directory || directory.readOnly || organizer.treeBlocked || organizer.saving) return;
    const itemData = active.data.current;
    let activeIdentity;
    try {
      activeIdentity = itemData?.type === 'item'
        ? { kind: itemData.kind, id: itemData.id }
        : parseDragId(String(active.id));
    } catch {
      return;
    }
    const collection = activeIdentity.kind === 'project' ? directory.projects : directory.groups;
    const item = collection.find((candidate) => candidate.id === activeIdentity.id);
    if (item) setActiveDrag({ kind: item.kind, id: item.id, name: item.name });
  };
  const handleDragCancel = () => setActiveDrag(null);
  const handleDragEnd = ({ active, over }) => {
    setActiveDrag(null);
    if (!over || !directory || directory.readOnly || organizer.treeBlocked) return;
    const itemData = active.data.current;
    const targetData = over.data.current;
    let activeIdentity;
    try {
      activeIdentity = itemData?.type === 'item'
        ? { kind: itemData.kind, id: itemData.id }
        : parseDragId(String(active.id));
    } catch {
      return;
    }
    const collection = activeIdentity.kind === 'project' ? directory.projects : directory.groups;
    const item = collection.find((candidate) => candidate.id === activeIdentity.id);
    if (!item) return;
    const containerParentId = targetData?.type === 'container'
      ? targetData.parentId
      : parseContainerParentId(String(over.id));
    if (containerParentId !== undefined) {
      if (containerParentId === item.parentId) return;
      organizer.repositionItem(item, containerParentId, null);
      return;
    }
    let targetIdentity;
    try {
      targetIdentity = targetData?.type === 'item'
        ? { kind: targetData.kind, id: targetData.id }
        : parseDragId(String(over.id));
    } catch {
      return;
    }
    if (targetIdentity.kind === item.kind && targetIdentity.id !== item.id) {
      const ordered = sortSummaries(collection);
      const activeIndex = ordered.findIndex((candidate) => candidate.id === item.id);
      const targetIndex = ordered.findIndex((candidate) => candidate.id === targetIdentity.id);
      const edge = activeIndex < targetIndex ? 'after' : 'before';
      const beforeId = calculateDropBeforeId(ordered, item.id, targetIdentity.id, edge);
      organizer.repositionItem(item, currentParentId, beforeId);
    } else if (targetIdentity.kind === 'group') {
      organizer.repositionItem(item, targetIdentity.id, null);
    }
  };

  if (organizer.loading && !directory) {
    return <section className="tigao-organizer" aria-busy="true"><p role="status">{messages.loading}</p></section>;
  }

  return (
    <section className="tigao-organizer" aria-label={messages.title}>
      <header className="tigao-organizer__header">
        <div>
          <h1>{messages.title}</h1>
          {directory?.owner && <p>{directory.owner.username}</p>}
        </div>
        {organizer.saving && <span role="status">{messages.saving}</span>}
      </header>

      {organizer.error && (
        <div className="tigao-organizer__alert" role="alert">
          <span>{organizer.error.message}</span>
          <button type="button" onClick={organizer.reload}>{messages.retry}</button>
        </div>
      )}
      {organizer.treeBlocked && <p className="tigao-organizer__warning">{messages.structureBlocked}</p>}
      {directory?.readOnly && <p className="tigao-organizer__readonly">{messages.readOnly}</p>}

      {directory && (
        <DndContext
          key={`${ownerId ?? 'current'}:${currentParentId ?? 'root'}`}
          sensors={sensors}
          collisionDetection={organizerCollisionDetection}
          onDragStart={handleDragStart}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          <nav className="tigao-organizer__breadcrumbs" aria-label={messages.root}>
            <BreadcrumbButton
              parentId={null}
              onNavigate={organizer.navigate}
              active={currentParentId === null}
              dropEnabled={Boolean(activeDrag) && currentParentId !== null && !organizer.saving}
            >
              {messages.root}
            </BreadcrumbButton>
            {directory.breadcrumbs.map((group, index) => (
              <span className="tigao-organizer__breadcrumb-part" key={group.id}>
                <span aria-hidden="true">/</span>
                <BreadcrumbButton
                  parentId={group.id}
                  onNavigate={organizer.navigate}
                  active={index === directory.breadcrumbs.length - 1}
                  dropEnabled={Boolean(activeDrag) && group.id !== currentParentId && !organizer.saving}
                >
                  {group.name}
                </BreadcrumbButton>
              </span>
            ))}
          </nav>

          {!directory.readOnly && !organizer.treeBlocked && (
            <CreateForms
              messages={messages}
              onCreateGroup={organizer.createGroup}
              onCreateProject={organizer.createProject}
              saving={organizer.saving}
            />
          )}

          {directory.groups.length === 0 && directory.projects.length === 0 ? (
            <p className="tigao-organizer__empty">{messages.empty}</p>
          ) : (
            <div className="tigao-organizer__content">
              {directory.groups.length > 0 && (
                <section className="tigao-organizer__section" aria-labelledby="tigao-organizer-groups-title">
                  <h2 id="tigao-organizer-groups-title">{messages.groups}</h2>
                  <SortableContext items={directory.groups.map((group) => createDragId('group', group.id))} strategy={rectSortingStrategy}>
                    <div className="tigao-organizer__grid">
                      {directory.groups.map((group, index) => (
                        <SortableCard
                          key={group.id}
                          item={group}
                          items={directory.groups}
                          index={index}
                          messages={messages}
                          icons={icons}
                          readOnly={directory.readOnly}
                          disabled={organizer.pendingIds.has(`group:${group.id}`) || organizer.treeBlocked}
                          onOpen={handleOpen}
                          onRename={(item) => setModal({ type: 'rename', item })}
                          onMove={(item) => setModal({ type: 'move', item })}
                          onDelete={(item) => setModal({ type: 'delete', item })}
                          onReposition={organizer.repositionItem}
                          activeDrag={activeDrag}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </section>
              )}
              {directory.projects.length > 0 && (
                <section className="tigao-organizer__section" aria-labelledby="tigao-organizer-projects-title">
                  <h2 id="tigao-organizer-projects-title">{messages.projects}</h2>
                  <SortableContext items={directory.projects.map((project) => createDragId('project', project.id))} strategy={rectSortingStrategy}>
                    <div className="tigao-organizer__grid">
                      {directory.projects.map((project, index) => (
                        <SortableCard
                          key={project.id}
                          item={project}
                          items={directory.projects}
                          index={index}
                          messages={messages}
                          icons={icons}
                          readOnly={directory.readOnly}
                          disabled={organizer.pendingIds.has(`project:${project.id}`) || organizer.treeBlocked}
                          onOpen={handleOpen}
                          onRename={(item) => setModal({ type: 'rename', item })}
                          onMove={(item) => setModal({ type: 'move', item })}
                          onDelete={(item) => setModal({ type: 'delete', item })}
                          onReposition={organizer.repositionItem}
                          activeDrag={activeDrag}
                          renderProjectExtraActions={renderProjectExtraActions}
                          renderProjectHostActions={renderProjectHostActions}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </section>
              )}
            </div>
          )}
          <DragOverlay>
            {activeDrag && (
              <div className="tigao-organizer__drag-overlay">
                <span aria-hidden="true">{activeDrag.kind === 'group' ? '▰' : '◇'}</span>
                <strong>{activeDrag.name}</strong>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {modal && (
        <OrganizerDialog
          modal={modal}
          messages={messages}
          pending={organizer.pendingIds.has(`${modal.item.kind}:${modal.item.id}`)}
          onClose={() => setModal(null)}
          onRename={organizer.renameItem}
          onMove={organizer.repositionItem}
          onDelete={organizer.deleteItem}
          loadMoveTargets={organizer.loadMoveTargets}
        />
      )}
    </section>
  );
}
