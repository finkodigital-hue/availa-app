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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (type: BlockType) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a block</DialogTitle>
          <DialogDescription>Inserted below the block you have selected.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {BLOCK_TYPES.map((type) => (
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
