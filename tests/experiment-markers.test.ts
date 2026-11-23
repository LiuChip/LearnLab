import { describe, expect, it } from 'vitest';
import { parseExperimentMarkers } from '../packages/markdown/src/experiments';

const block = (body: string) => '```lab\n' + body + '\n```';

describe('parseExperimentMarkers', () => {
  it('parses a lab block with hints and defaults', () => {
    const md = '# T\n\n' + block('id: select-basic\ntitle: 选取全部\ntype: auto\ninstruction: 查询 users 表\nhints:\n  - 试试 SELECT\n  - { level: 2, message: 用星号 }');
    const result = parseExperimentMarkers(md);
    expect(result.errors).toEqual([]);
    expect(result.experiments).toEqual([
      {
        id: 'select-basic', title: '选取全部', type: 'auto', instruction: '查询 users 表', line: 3,
        hints: [{ level: 1, message: '试试 SELECT' }, { level: 2, message: '用星号' }]
      }
    ]);
    expect(parseExperimentMarkers(block('id: x')).experiments[0]).toMatchObject({ title: 'x', type: 'manual' });
  });

  it('isolates a broken block so other experiments still parse', () => {
    const md = [block('id: a'), block('id: [unclosed'), block('title: no id'), block('id: ../evil'), block('id: b\ntype: weird'), block('id: c')].join('\n\n');
    const result = parseExperimentMarkers(md);
    expect(result.experiments.map((e) => e.id)).toEqual(['a', 'c']);
    expect(result.errors).toHaveLength(4);
  });

  it('rejects duplicate ids and keeps the first', () => {
    const result = parseExperimentMarkers(block('id: a\ntitle: first') + '\n\n' + block('id: a\ntitle: second'));
    expect(result.experiments).toHaveLength(1);
    expect(result.experiments[0].title).toBe('first');
    expect(result.errors[0].message).toContain('重复');
  });

  it('ignores lab examples nested in other fences and reports unclosed blocks', () => {
    const nested = '````markdown\n' + block('id: shown') + '\n````';
    expect(parseExperimentMarkers(nested).experiments).toEqual([]);
    expect(parseExperimentMarkers('```sql\nSELECT 1;\n```').errors).toEqual([]);
    expect(parseExperimentMarkers('```lab\nid: a').errors[0].message).toContain('结束围栏');
  });
});
