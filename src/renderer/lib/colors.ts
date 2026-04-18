export interface ProjectColor {
  name: string;
  value: string;
}

export const PROJECT_COLORS: ProjectColor[] = [
  { name: "Violet", value: "#8b5cf6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Green", value: "#22c55e" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Orange", value: "#f97316" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Slate", value: "#64748b" },
];

export function nextColor(usedColors: string[]): string {
  for (const color of PROJECT_COLORS) {
    if (!usedColors.includes(color.value)) return color.value;
  }
  return PROJECT_COLORS[0].value;
}
