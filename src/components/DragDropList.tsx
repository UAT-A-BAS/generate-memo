"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
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
};

function SortableItem<T extends Identified>({
  item,
  index,
  renderItem,
  itemLabel,
}: {
  item: T;
  index: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  itemLabel: (item: T, index: number) => string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`grid min-w-0 grid-cols-[32px_minmax(0,1fr)] gap-2 rounded-md border bg-white p-2 shadow-sm ${
        isDragging ? "border-slate-900 shadow-md" : "border-slate-300"
      }`}
    >
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
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

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="grid min-w-0 gap-3">
          {items.map((item, index) => (
            <SortableItem
              key={item.id}
              item={item}
              index={index}
              renderItem={renderItem}
              itemLabel={itemLabel}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
