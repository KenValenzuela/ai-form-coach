export const uid = (): string => Math.random().toString(36).slice(2, 8);

export const today = (): string =>
  new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const fmt = (n: number): string => Number(n).toLocaleString();
