import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import type { Source } from '../lib/types.ts';
import { DropZone } from './DropZone.tsx';
import { ScrapCard } from './ScrapCard.tsx';

interface Props {
  sources: Source[];
  isDropping: boolean;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onRotate: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
}

export function Board({ sources, isDropping, onFiles, onRemove, onRotate, onMove }: Props) {
  const sensors = useSensors(
    // A small distance threshold keeps a click on the remove button from being
    // swallowed as the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const toIndex = sources.findIndex((source) => source.id === over.id);
    if (toIndex !== -1) onMove(String(active.id), toIndex);
  }

  return (
    <div className={`board${isDropping ? ' board--dropping' : ''}`}>
      {sources.length === 0 ? (
        <DropZone variant="empty" onFiles={onFiles} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sources.map((s) => s.id)} strategy={rectSortingStrategy}>
            <ul className="board__grid">
              {sources.map((source, index) => (
                <ScrapCard
                  key={source.id}
                  source={source}
                  index={index}
                  onRemove={onRemove}
                  onRotate={onRotate}
                />
              ))}
              <li className="board__add">
                <DropZone variant="tile" onFiles={onFiles} />
              </li>
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {isDropping && (
        <div className="board__drop-hint" aria-hidden="true">
          Drop to add
        </div>
      )}
    </div>
  );
}
