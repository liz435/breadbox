type CompiledPromptPreviewProps = {
  compiledPrompt: string;
};

export function CompiledPromptPreview({ compiledPrompt }: CompiledPromptPreviewProps) {
  return (
    <section className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compiled Prompt</h2>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs leading-relaxed text-muted-foreground">
        {compiledPrompt || "Create a segment and render a target frame to preview the compiled provider prompt."}
      </pre>
    </section>
  );
}
