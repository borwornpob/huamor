const counters = new Map<string, number>();

export function incrementMetric(name: string, amount = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + amount);
}

export function setMetric(name: string, value: number): void {
  counters.set(name, value);
}

export function getMetricsSnapshot(): Record<string, number> {
  return Object.fromEntries(counters.entries());
}

export function renderPrometheusMetrics(): string {
  return Array.from(counters.entries())
    .map(([name, value]) => `${name} ${value}`)
    .join("\n");
}
