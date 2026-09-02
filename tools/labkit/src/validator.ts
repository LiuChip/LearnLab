import { loadPackage } from '@learnlab/core';

export async function validatePackageDirectory(packageDir: string) {
  return loadPackage(packageDir);
}
