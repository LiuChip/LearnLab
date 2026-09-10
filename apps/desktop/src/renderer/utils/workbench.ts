export type WorkbenchActivityId =
  | 'chapters'
  | 'search'
  | 'experiments'
  | 'plugins'
  | 'dependencies'
  | 'workspace'
  | 'explorer';

export const WORKBENCH_ACTIVITY_IDS: readonly WorkbenchActivityId[] = [
  'chapters',
  'search',
  'experiments',
  'plugins',
  'dependencies',
  'workspace',
  'explorer'
];

export const WORKBENCH_ACTIVITY_LABELS: Record<WorkbenchActivityId, string> = {
  chapters: '章节',
  search: '搜索和替换',
  experiments: '实验',
  plugins: '插件',
  dependencies: '依赖',
  workspace: '学习区',
  explorer: '文件资源管理器'
};