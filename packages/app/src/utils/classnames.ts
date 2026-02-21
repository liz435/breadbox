export function cn(...inputs: (string | boolean | null | undefined)[]): string {
  return inputs.filter(Boolean).join(" ");
}
