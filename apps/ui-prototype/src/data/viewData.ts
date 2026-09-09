export interface TutorialContent {
  eyebrow: string;
  title: string;
  description: string;
  sections: Array<{ title: string; copy: string }>;
  code: string;
}

export const chapterContent: Record<string, TutorialContent> = {
  basics: {
    eyebrow: '第 1 章 · 查询基础',
    title: '用 SELECT 读懂一张表',
    description:
      '从最小的查询开始，理解列、表达式和结果集。完成本章后，你可以读出一张表中真正需要的信息。',
    sections: [
      {
        title: '选择你需要的列',
        copy: 'SELECT 语句的第一部分描述结果中应该出现哪些列。先从明确的列名开始，而不是依赖通配符。'
      },
      {
        title: '让结果可被验证',
        copy: '将查询写得短一些、清晰一些。运行实验后，结果集会显示在实验历史中，方便你回看。'
      }
    ],
    code: 'SELECT name, score\nFROM students\nORDER BY score DESC;'
  },
  filtering: {
    eyebrow: '第 2 章 · 条件过滤',
    title: '让查询回答一个具体问题',
    description: 'WHERE 会把“所有记录”收敛成“符合条件的记录”。这一章将从比较、组合条件开始。',
    sections: [
      { title: '先写出条件', copy: '条件过滤的关键是把自然语言问题改写成一个可以验证的表达式。' },
      {
        title: '再观察边界',
        copy: '等于、大于、小于以及 NULL 都有自己的语义，实验会帮助你看见差异。'
      }
    ],
    code: 'SELECT name, score\nFROM students\nWHERE score >= 60;'
  },
  joins: {
    eyebrow: '第 3 章 · 连接与关系',
    title: '把相关的数据放在一起',
    description: '当信息分布在多张表中时，JOIN 让它们通过共同的键重新建立关系。',
    sections: [
      { title: '找到连接键', copy: '先确认两张表之间的关系，再决定要保留哪些记录。' },
      { title: '控制结果规模', copy: '明确连接条件可以避免意外的笛卡尔积，让报表结果保持可读。' }
    ],
    code: 'SELECT students.name, courses.title\nFROM students\nINNER JOIN courses\n  ON students.course_id = courses.id;'
  },
  project: {
    eyebrow: '第 4 章 · 综合实验',
    title: '从问题到一份可解释的报表',
    description: '综合使用查询、过滤和连接，完成一次面向真实问题的分析。',
    sections: [
      { title: '拆解问题', copy: '先确定报表需要的字段，再逐步添加过滤和聚合。' },
      { title: '保留解释路径', copy: '好的查询不仅得到结果，也让别人能够理解结果从哪里来。' }
    ],
    code: 'SELECT course, AVG(score) AS average_score\nFROM results\nGROUP BY course;'
  }
};

export const pluginItems = [
  {
    id: 'sql-runner',
    name: 'SQL Runner',
    description: '在实验包沙箱中运行 SQL 查询',
    version: '1.4.2',
    state: '已加载',
    glyph: 'DB',
    color: 'blue'
  },
  {
    id: 'markdown-tools',
    name: 'Markdown Tools',
    description: '提供章节解析和目录导航',
    version: '0.8.1',
    state: '已加载',
    glyph: 'MD',
    color: 'purple'
  },
  {
    id: 'ai-lab',
    name: 'AI Lab Assistant',
    description: '在右侧辅助栏中提供学习提示',
    version: '0.6.0',
    state: '已加载',
    glyph: 'AI',
    color: 'orange'
  },
  {
    id: 'mysql-client',
    name: 'MySQL Client',
    description: '可选的外部客户端适配器',
    version: '0.3.0',
    state: '未配置',
    glyph: 'MY',
    color: 'teal'
  }
];

export const dependencyItems = [
  { name: 'SQLite 3', version: '3.45.1', kind: '独立运行时', status: '就绪', size: '4.8 MB' },
  {
    name: 'SQL Runner Runtime',
    version: '1.4.2',
    kind: '插件运行时',
    status: '就绪',
    size: '18.2 MB'
  },
  { name: 'MySQL Client', version: '8.x', kind: '外部软件', status: '未安装', size: '由用户管理' }
];

export const workspaceItems = [
  { name: 'SQL 基础', author: 'LearnLab Team', progress: 62, updated: '今天' },
  { name: 'Python 数据处理', author: 'Open Course', progress: 18, updated: '昨天' },
  { name: 'Linux 命令行', author: 'Community', progress: 0, updated: '3 天前' }
];

export const explorerItems = [
  { name: 'chapters', type: 'folder' },
  { name: 'experiments', type: 'folder' },
  { name: 'assets', type: 'folder' },
  { name: 'README.md', type: 'file' },
  { name: 'manifest.json', type: 'file' },
  { name: 'experiment_history', type: 'file' }
];
