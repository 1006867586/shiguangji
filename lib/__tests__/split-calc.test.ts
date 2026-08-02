import { describe, it, expect } from "vitest";

// ============================================================
// 分账 equal 模式分摊算法测试
//
// app/api/activities/[id]/split/route.ts 的 POST 中，equal 模式的金额
// 分摊逻辑内联未抽取（base/remainder 计算 + 余数归属）。为避免改动源码，
// 本文件镜像该算法作为纯函数，用于锁定分摊金额计算行为，防止回归。
//
// 注意：若 route.ts 中的算法变更，需同步更新此处镜像实现。
// ============================================================

/**
 * 镜像 route.ts POST 中 equal 模式的分摊计算逻辑：
 *   base = floor(totalAmount / n)
 *   remainder = totalAmount - base * n
 *   每人先得 base；余数加给创建者（若其在参与者中），否则加给第一个参与者。
 */
function computeEqualShares(
  totalAmount: number,
  participantIds: string[],
  creatorId: string
): Record<string, number> {
  const n = participantIds.length;
  const base = Math.floor(totalAmount / n);
  const remainder = totalAmount - base * n;
  const shares: Record<string, number> = {};
  for (const uid of participantIds) {
    shares[uid] = base;
  }
  // 余数加给创建者（若其在参与者中），否则加给第一个参与者
  const target = participantIds.includes(creatorId)
    ? creatorId
    : participantIds[0];
  shares[target] = base + remainder;
  return shares;
}

/** 工具：求份额总和（单位:分） */
function sum(shares: Record<string, number>): number {
  return Object.values(shares).reduce((a, b) => a + b, 0);
}

describe("equal 模式分摊算法（route.ts 镜像）", () => {
  it("100 分 3 人：base=33，余数 1 加给创建者得 34", () => {
    const shares = computeEqualShares(100, ["a", "b", "c"], "a");
    expect(shares).toEqual({ a: 34, b: 33, c: 33 });
    expect(sum(shares)).toBe(100);
  });

  it("100 分 4 人：base=25，余数 0，均分", () => {
    const shares = computeEqualShares(100, ["a", "b", "c", "d"], "a");
    expect(shares).toEqual({ a: 25, b: 25, c: 25, d: 25 });
    expect(sum(shares)).toBe(100);
  });

  it("0 分 3 人：全 0", () => {
    const shares = computeEqualShares(0, ["a", "b", "c"], "a");
    expect(shares).toEqual({ a: 0, b: 0, c: 0 });
    expect(sum(shares)).toBe(0);
  });

  it("余数加给创建者（创建者位于参与者中间）", () => {
    // 10 分 3 人：base=3，余数 1，创建者 b 得 4
    const shares = computeEqualShares(10, ["a", "b", "c"], "b");
    expect(shares).toEqual({ a: 3, b: 4, c: 3 });
    expect(sum(shares)).toBe(10);
  });

  it("创建者不在参与者中时，余数加给第一个参与者", () => {
    // 100 分 3 人，创建者 z 不在参与者中，余数 1 加给 participantIds[0] = "a"
    const shares = computeEqualShares(100, ["a", "b", "c"], "z");
    expect(shares).toEqual({ a: 34, b: 33, c: 33 });
    expect(sum(shares)).toBe(100);
  });

  it("首位参与者承接余数（与数组顺序一致）", () => {
    // 创建者不在内，验证余数落在数组第一个元素 x，而非其他位置
    const shares = computeEqualShares(10, ["x", "y", "z"], "creator");
    expect(shares).toEqual({ x: 4, y: 3, z: 3 });
    expect(sum(shares)).toBe(10);
  });

  it("大额整除无余数", () => {
    const shares = computeEqualShares(1000000, ["a", "b"], "a");
    expect(shares).toEqual({ a: 500000, b: 500000 });
    expect(sum(shares)).toBe(1000000);
  });
});
