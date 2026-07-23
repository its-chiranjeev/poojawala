import { Transform } from 'class-transformer';

export function ParseIntArray() {
  return Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const numbers: number[] = [];

    const collectNumbers = (input: unknown): void => {
      if (input === undefined || input === null || input === '') {
        return;
      }

      if (Array.isArray(input)) {
        for (const item of input) {
          collectNumbers(item);
        }
        return;
      }

      if (typeof input === 'number') {
        if (!Number.isNaN(input)) {
          numbers.push(input);
        }
        return;
      }

      if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) {
          return;
        }

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            const parsed = JSON.parse(trimmed);
            collectNumbers(parsed);
            return;
          } catch {
            const inner = trimmed.slice(1, -1);
            if (!inner.trim()) {
              return;
            }
            for (const part of inner.split(',')) {
              collectNumbers(part);
            }
            return;
          }
        }

        if (trimmed.includes(',')) {
          for (const part of trimmed.split(',')) {
            collectNumbers(part);
          }
          return;
        }

        const asNumber = Number(trimmed);
        if (!Number.isNaN(asNumber)) {
          numbers.push(asNumber);
        }
      }
    };

    collectNumbers(value);

    return numbers.length ? numbers : undefined;
  });
}
