import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BLOCK_TYPES, BLOCK_LABELS, type BlockType } from "@/components/page-blocks";
import { BlockThumbnail } from "./block-thumbnail";

export function AddBlockPicker({
  open,
  onOpenChange,
  onAdd,
  types = BLOCK_TYPES,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (type: BlockType) => void;
  types?: BlockType[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{types.length === 1 ? "Add an about section" : "Add a block"}</DialogTitle>
          <DialogDescription>
            {types.length === 1
              ? "Share your salon story beneath the main booking sections."
              : "Inserted below the block you have selected."}
          </DialogDescription>
        </DialogHeader>
        <div className={`grid gap-3 ${types.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {types.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                onAdd(type);
                onOpenChange(false);
              }}
              className="rounded-xl border p-2.5 text-left hover:border-primary/50 hover:bg-secondary/30 transition-colors"
            >
              <BlockThumbnail type={type} />
              <div className="text-sm font-medium mt-2">{BLOCK_LABELS[type]}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
