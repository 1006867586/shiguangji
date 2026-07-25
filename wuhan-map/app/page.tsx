"use client";

import { useCallback, useEffect, useState } from "react";
import WuhanMap from "@/components/WuhanMap";
import MemoryPanel from "@/components/MemoryPanel";
import { countByDistrict } from "@/lib/memory-store";
import { districtNames } from "@/lib/wuhan-geo";

export default function HomePage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refreshCounts = useCallback(async () => {
    const c = await countByDistrict(districtNames);
    setCounts(c);
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  const totalMemories = Object.values(counts).reduce((a, b) => a + b, 0);
  const litDistricts = Object.values(counts).filter((n) => n > 0).length;

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      {/* 顶部标题栏 */}
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-6 py-4">
        <div className="pointer-events-auto">
          <h1 className="text-xl font-semibold text-[#1f2937]">武汉记忆地图</h1>
          <p className="text-xs text-[#5a6670]">
            点击任一行政区，记录你在那里的回忆
          </p>
        </div>
        <div className="pointer-events-auto rounded-lg border border-[#d8ddd8] bg-white/80 px-3 py-1.5 text-xs text-[#5a6670] backdrop-blur">
          {litDistricts} / {districtNames.length} 个区已点亮 · 共 {totalMemories}{" "}
          条回忆
        </div>
      </header>

      {/* 地图 */}
      <WuhanMap
        selectedDistrict={selected}
        counts={counts}
        onSelect={setSelected}
      />

      {/* 侧边回忆面板 */}
      <MemoryPanel
        district={selected}
        onClose={() => setSelected(null)}
        onChanged={refreshCounts}
      />
    </main>
  );
}
