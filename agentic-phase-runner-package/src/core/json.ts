const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort((left, right) => left.localeCompare(right));
    const sorted: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }

  return value;
};

export const stringifyDeterministicJson = (value: unknown): string =>
  `${JSON.stringify(sortValue(value), null, 2)}\n`;
