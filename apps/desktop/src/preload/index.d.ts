import type { LoadedPackage, LoadError } from '@learnlab/core';
import type { Result } from '@learnlab/core-types';

export interface LearnLabAPI {
  getExamplePackageDir: () => Promise<string>;
  loadPackage: (packageDir: string) => Promise<Result<LoadedPackage, LoadError>>;
  readChapter: (packageDir: string, chapterFile: string) => Promise<Result<string, LoadError>>;
}

declare global {
  interface Window {
    learnlab: LearnLabAPI;
  }
}
