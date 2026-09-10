import { describe, expect, it } from 'vitest';
import { WORKBENCH_ACTIVITY_IDS } from '../apps/desktop/src/renderer/utils/workbench';

describe('Workbench shell contract', () => {
  it('keeps the frozen Activity Bar entry order', () => {
    expect(WORKBENCH_ACTIVITY_IDS).toEqual([
      'chapters',
      'search',
      'experiments',
      'plugins',
      'dependencies',
      'workspace',
      'explorer'
    ]);
  });
});