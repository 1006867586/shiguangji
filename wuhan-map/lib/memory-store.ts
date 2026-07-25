"use client";

import { createStore, get, set, del } from "idb-keyval";

// 单独的 store，避免和其他 key 冲突
const store = createStore("wuhan-map-db", "memories");

export interface Memory {
  id: string;
  district: string; // 区名，例如 "武昌区"
  title: string;
  note: string;
  createdAt: number;
  // 照片以 dataURL 形式存储，纯本地、无后端
  photos: string[];
}

/**
 * 索引结构：key = `memories:${districtName}`，value = Memory[]
 * 这样按区读取很快，且不会把所有区数据一次性拉进内存。
 */
const keyOf = (district: string) => `memories:${district}`;

export async function listMemories(district: string): Promise<Memory[]> {
  const list = (await get<Memory[]>(keyOf(district))) ?? [];
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

export async function addMemory(
  district: string,
  input: Omit<Memory, "id" | "createdAt" | "district">,
): Promise<Memory> {
  const list = (await get<Memory[]>(keyOf(district))) ?? [];
  const memory: Memory = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    district,
    ...input,
  };
  await set(keyOf(district), [memory, ...list]);
  return memory;
}

export async function deleteMemory(district: string, id: string): Promise<void> {
  const list = (await get<Memory[]>(keyOf(district))) ?? [];
  await set(
    keyOf(district),
    list.filter((m) => m.id !== id),
  );
}

/** 删除某个 key（用于清空单区） */
export async function clearDistrict(district: string): Promise<void> {
  await del(keyOf(district));
}

/**
 * 统计：返回每个区有多少条回忆，用于在地图上点亮。
 * 注意：indexedDB 没法跨 key 查询，这里遍历已知区名列表。
 */
export async function countByDistrict(
  districtNames: string[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  await Promise.all(
    districtNames.map(async (name) => {
      const list = (await get<Memory[]>(keyOf(name))) ?? [];
      result[name] = list.length;
    }),
  );
  return result;
}
