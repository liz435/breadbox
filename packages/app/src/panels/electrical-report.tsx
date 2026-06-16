import { useElectricalReport } from "@/electrical/power-budget";
import { cn } from "@/utils/classnames";

function SeverityPill({ severity }: { severity: "error" | "warning" }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        severity === "error"
          ? "bg-red-500/20 text-red-300 border border-red-500/40"
          : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
      )}
    >
      {severity}
    </span>
  );
}

export function ElectricalReportPanel() {
  const report = useElectricalReport();
  const errors = report.issues.filter((issue) => issue.severity === "error");
  const warnings = report.issues.filter((issue) => issue.severity === "warning");

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card">
      <div className="border-b border-border px-3 py-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">Electrical</span>
          <span className="text-[10px] text-muted-foreground">
            Total draw: {report.estimatedTotalCurrentMa.toFixed(1)}mA
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 text-xs">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300">
            {errors.length} error{errors.length === 1 ? "" : "s"}
          </span>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
            {warnings.length} warning{warnings.length === 1 ? "" : "s"}
          </span>
        </div>

        {report.issues.length === 0 ? (
          <p className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-emerald-300">
            No electrical safety issues detected.
          </p>
        ) : (
          <div className="space-y-2">
            {report.issues.map((issue, idx) => (
              <div
                key={`${issue.code}-${issue.componentId ?? "na"}-${idx}`}
                className={cn(
                  "rounded border px-2 py-1.5",
                  issue.severity === "error"
                    ? "border-red-500/40 bg-red-500/10"
                    : "border-amber-500/40 bg-amber-500/10"
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <SeverityPill severity={issue.severity} />
                  <span className="text-[10px] text-muted-foreground">{issue.code}</span>
                </div>
                <p className="text-foreground">{issue.message}</p>
              </div>
            ))}
          </div>
        )}

        {report.recommendations.length > 0 && (
          <div className="mt-3 rounded border border-border bg-card/60 p-2">
            <p className="mb-1 text-[11px] font-semibold text-foreground">Recommended fixes</p>
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              {report.recommendations.map((rec) => (
                <li key={rec.code}>- {rec.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

