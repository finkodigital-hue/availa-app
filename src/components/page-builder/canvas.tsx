import { useEffect, useId, useRef } from "react";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PublicBookingPage, type PublicBookingBusiness } from "@/components/public-booking-page";
import type { PageBlock } from "@/components/page-blocks";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { StorefrontSettings } from "@/lib/storefront";

// The right-hand pane: the real public page, mounted in-process (same
// pattern as WizardPagePreview) so it's never a fake preview and never an
// iframe — full size, instantly reactive to `blocks`/`theme` state, no
// network round trip. Each block is wrapped via PublicBookingPage's
// `renderBlock` prop with a hover/select/drag-handle shell, without forking
// BlockRenderer or any block component.
export function PageBuilderCanvas({
  business,
  theme,
  blocks,
  storefrontSettings,
  selectedBlockId,
  onSelectBlock,
  onReorder,
}: {
  business: PublicBookingBusiness;
  theme: Theme;
  blocks: PageBlock[];
  storefrontSettings: StorefrontSettings;
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onReorder: (activeId: string, overId: string) => void;
}) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <PublicBookingPage
          business={business}
          theme={theme}
          pageBlocks={blocks}
          storefrontSettings={storefrontSettings}
          domId={`canvas-${reactId}`}
          renderBlock={(block, _index, children) => (
            <CanvasBlockShell
              blockId={block.id}
              selected={block.id === selectedBlockId}
              onSelect={() => onSelectBlock(block.id)}
            >
              {children}
            </CanvasBlockShell>
          )}
        />
      </SortableContext>
    </DndContext>
  );
}

function CanvasBlockShell({
  blockId,
  selected,
  onSelect,
  children,
}: {
  blockId: string;
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: blockId,
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Selecting a block from the left panel scrolls it into view on the
  // canvas — selecting via a canvas click already puts it in view, so this
  // only meaningfully fires for the panel-initiated direction, keeping both
  // in sync either way since they share the same selectedBlockId state.
  useEffect(() => {
    if (selected) scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selected]);

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        scrollRef.current = node;
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      // Capture phase, before the click ever reaches a real link/button inside
      // the block (hero CTA, a service "select" row, etc.) — selecting a block
      // for editing must never also trigger what it does on the real page.
      onClickCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect();
      }}
      className={cn(
        "group relative rounded-lg outline outline-2 outline-offset-4 cursor-pointer transition-colors",
        selected ? "outline-primary" : "outline-transparent hover:outline-primary/30",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClickCapture={(e) => e.stopPropagation()}
        className={cn(
          "absolute right-2 top-2 z-10 h-7 w-7 grid place-items-center rounded-md border bg-card shadow-soft text-muted-foreground cursor-grab active:cursor-grabbing transition-opacity",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}
