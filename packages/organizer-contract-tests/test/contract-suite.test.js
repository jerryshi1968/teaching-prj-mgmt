import { expect, it } from 'vitest';
import { createMemoryOrganizerHarness, runProjectOrganizerAdapterContract } from '../src/index.js';

const assert = {
  equal(actual, expected) {
    expect(actual).toBe(expected);
  },
  deepEqual(actual, expected) {
    expect(actual).toEqual(expected);
  },
  ok(actual) {
    expect(actual).toBeTruthy();
  },
  throws(operation, matcher) {
    expect(operation).toThrow(matcher);
  },
  async rejects(operation, predicate) {
    try {
      await operation();
    } catch (error) {
      if (predicate) expect(predicate(error)).toBe(true);
      return;
    }
    throw new Error('Expected the operation to reject.');
  }
};

runProjectOrganizerAdapterContract({
  test: it,
  assert,
  createHarness: () => createMemoryOrganizerHarness()
});

it('creates an isolated harness for every call', async () => {
  const first = createMemoryOrganizerHarness();
  const second = createMemoryOrganizerHarness();
  await first.adapter.loadDirectory({});
  await first.adapter.deleteItem({ kind: 'project', id: 'project-root-a' });
  expect(first.getState()).not.toEqual(second.getState());
  expect(second.getState().projects.some((project) => project.id === 'project-root-a')).toBe(true);
});
