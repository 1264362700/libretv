import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atomicWriteJsonSync, getDataDir, getStoreFilePath } from './json-store';

/**
 * 存储层测试：atomicWriteJsonSync 的容灾语义 + DATA_DIR 解析。
 * 世代快照的滚动行为已在 snapshot-resilience.test.ts 覆盖，
 * 这里只补该文件没测的两点：临时文件不残留、DATA_DIR 优先级。
 */

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'libretv-jsonstore-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe('json-store: atomicWriteJsonSync', () => {
  it('写入后目录与文件均存在，且内容为格式化 JSON', () => {
    const file = path.join(tmpRoot, 'nested', 'deep', 'store.json');
    atomicWriteJsonSync(file, { a: 1, b: ['x'] });

    expect(fs.existsSync(file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ a: 1, b: ['x'] });
  });

  it('不残留任何临时文件', () => {
    const file = path.join(tmpRoot, 'store.json');
    atomicWriteJsonSync(file, { v: 1 });
    atomicWriteJsonSync(file, { v: 2 });

    const leftovers = fs.readdirSync(tmpRoot).filter((n) => n.includes('.tmp.'));
    expect(leftovers).toEqual([]);
  });

  it('目录里只有目标文件与 .prev.json 快照', () => {
    const file = path.join(tmpRoot, 'store.json');
    atomicWriteJsonSync(file, { v: 1 });
    atomicWriteJsonSync(file, { v: 2 });

    expect(fs.readdirSync(tmpRoot).sort()).toEqual(['store.json', 'store.json.prev.json']);
  });

  it('覆盖写入时 .prev.json 保留上一代内容，当前文件是新内容', () => {
    const file = path.join(tmpRoot, 'store.json');
    atomicWriteJsonSync(file, { v: 'first' });
    atomicWriteJsonSync(file, { v: 'second' });

    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ v: 'second' });
    expect(JSON.parse(fs.readFileSync(`${file}.prev.json`, 'utf-8'))).toEqual({ v: 'first' });
  });

  it('已有文件过小（<10 字节）时不生成快照，避免把半写状态存成「世代备份」', () => {
    const file = path.join(tmpRoot, 'store.json');
    fs.writeFileSync(file, '{}', 'utf-8'); // 2 字节
    atomicWriteJsonSync(file, { full: true });

    expect(fs.existsSync(`${file}.prev.json`)).toBe(false);
  });
});

describe('json-store: getDataDir', () => {
  it('DATA_DIR 存在且可写时优先使用它', () => {
    process.env.DATA_DIR = tmpRoot;
    expect(getDataDir()).toBe(tmpRoot);
    expect(fs.existsSync(tmpRoot)).toBe(true);
  });

  it('DATA_DIR 指向不存在路径时会自动创建', () => {
    const target = path.join(tmpRoot, 'auto-created');
    process.env.DATA_DIR = target;
    expect(getDataDir()).toBe(target);
    expect(fs.existsSync(target)).toBe(true);
  });

  it('getStoreFilePath 把 auth-store.json 拼在数据目录下', () => {
    process.env.DATA_DIR = tmpRoot;
    expect(getStoreFilePath()).toBe(path.join(tmpRoot, 'auth-store.json'));
  });
});
