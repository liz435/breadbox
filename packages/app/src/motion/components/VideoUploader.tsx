import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VideoUploaderProps = {
  disabled?: boolean;
  onUpload: (file: File) => void;
};

export function VideoUploader({ disabled, onUpload }: VideoUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  function pickFile(file: File | undefined) {
    if (!file || disabled) return;
    onUpload(file);
  }

  return (
    <section className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source Video</h2>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          pickFile(event.dataTransfer.files[0]);
        }}
        className={cn(
          "flex min-h-32 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-background px-4 text-center transition-colors",
          dragActive && "border-foreground bg-accent/40",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <Upload className="size-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-foreground">Drop a short .mp4 or .mov</p>
          <p className="mt-1 text-xs text-muted-foreground">MVP limit: 250 MB</p>
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,.mov,.m4v"
        className="hidden"
        onChange={(event) => pickFile(event.target.files?.[0])}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="mt-3 w-full"
      >
        <Upload className="size-3.5" />
        Choose Video
      </Button>
    </section>
  );
}
