import { Eta } from "eta";
import path from "path";

export const eta = new Eta({
  views: path.join(import.meta.dir, "../views"),
  cache: process.env.NODE_ENV === "production",
  autoEscape: true,
});

// Helper to render a template and return the result
export function render(template: string, data: object = {}): string {
  return eta.render(template, data);
}
