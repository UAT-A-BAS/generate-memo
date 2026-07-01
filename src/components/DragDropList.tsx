"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  useDndContext,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

type Identified = {
  id: string;
};

type DragDropListProps<T extends Identified> = {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  itemLabel: (item: T, index: number) => string;
  listId?: string;
  withContext?: boolean;
  onCrossReorder?: (event: DragEndEvent) => void;
};

const pointerFirstCollision: CollisionDetection = (args) => {
  const withoutActive = <T extends { id: string | number }>(collisions: T[]) =>
    collisions.filter((collision) => collision.id !== args.active.id);
  const pointerCollisions = withoutActive(pointerWithin(args));
  return pointerCollisions.length ? pointerCollisions : withoutActive(closestCenter(args));
};

function SortableItem<T extends Identified>({
  item,
  index,
  renderItem,
  itemLabel,
  listId,
}: {
  item: T;
  index: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  itemLabel: (item: T, index: number) => string;
  listId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, data: { listId } });
  const dragContext = useDndContext();
  const isCurrentDropTarget = Boolean(
    dragContext.over?.id === item.id && dragContext.active?.id !== item.id,
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-drop-target-active={isCurrentDropTarget ? "true" : undefined}
      data-drop-target-current={isCurrentDropTarget ? "true" : undefined}
      className={`relative grid min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-2 rounded-xl border bg-white p-2 shadow-sm transition-colors ${
        isDragging
          ? "z-20 border-slate-900 bg-slate-50 opacity-60 shadow-md"
          : isCurrentDropTarget
            ? "border-[#0b84d8] bg-[#eef8ff] ring-4 ring-[#0b84d8]/20"
            : "border-slate-300"
      }`}
    >
      {isCurrentDropTarget ? (
        <span className="pointer-events-none absolute right-3 top-2 z-10 rounded-full bg-[#0b84d8] px-2.5 py-1 text-xs font-bold text-white shadow-sm">
          Lepaskan di sini
        </span>
      ) : null}
      <button
        type="button"
        className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
        aria-label={`Ubah urutan ${itemLabel(item, index)}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={17} />
      </button>
      <div className="min-w-0 overflow-hidden">{renderItem(item, index)}</div>
    </div>
  );
}

export function DragDropList<T extends Identified>({
  items,
  onReorder,
  renderItem,
  itemLabel,
  listId = "default",
  withContext = true,
  onCrossReorder,
}: DragDropListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (
      active.data.current?.listId !== listId ||
      over.data.current?.listId !== listId
    ) {
      onCrossReorder?.(event);
      return;
    }

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  const content = (
    <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
      <div className="grid min-w-0 gap-3">
        {items.map((item, index) => (
          <SortableItem
            key={item.id}
            item={item}
            index={index}
            renderItem={renderItem}
            itemLabel={itemLabel}
            listId={listId}
          />
        ))}
      </div>
    </SortableContext>
  );

  if (!withContext) return content;

  return (
    <DndContext sensors={sensors} collisionDetection={pointerFirstCollision} onDragEnd={handleDragEnd}>
      {content}
    </DndContext>
  );
}
