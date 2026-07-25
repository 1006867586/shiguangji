"use client";

import { useEffect, useState } from "react";
import { X, Plus, Trash2, ImageIcon } from "lucide-react";
import {
  addMemory,
  deleteMemory,
  listMemories,
  type Memory,
} from "@/lib/memory-store";

interface MemoryPanelProps {
  district: string | null;
  onClose: () => void;
  /** 某区的回忆发生增删后，通知父组件刷新 counts */
  onChanged: () => void;
}

export default function MemoryPanel({
  district,
  onClose,
  onChanged,
}: MemoryPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);

  // 新增表单
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!district) {
      setMemories([]);
      return;
    }
    setLoading(true);
    listMemories(district)
      .then(setMemories)
      .finally(() => setLoading(false));
    // 切换区时清空表单
    setTitle("");
    setNote("");
    setPhotos([]);
  }, [district]);

  if (!district) return null;

  async function handleAdd() {
    if (!district) return;
    if (!title.trim() && !note.trim() && photos.length === 0) return;
    await addMemory(district, {
      title: title.trim() || "未命名回忆",
      note: note.trim(),
      photos,
    });
    setTitle("");
    setNote("");
    setPhotos([]);
    const fresh = await listMemories(district);
    setMemories(fresh);
    onChanged();
  }

  async function handleDelete(id: string) {
    if (!district) return;
    await deleteMemory(district, id);
    const fresh = await listMemories(district);
    setMemories(fresh);
    onChanged();
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setPhotos((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }

  return (
    <div className="pointer-events-auto absolute right-0 top-0 z-20 flex h-full w-full max-w-md flex-col border-l border-[#d8ddd8] bg-[#fafaf7]/95 shadow-[-12px_0_28px_rgba(90,102,112,0.08)] backdrop-blur">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-[#d8ddd8] px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-[#1f2937]">{district}</h2>
          <p className="text-xs text-[#5a6670]">
            {memories.length} 条回忆
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-[#5a6670] hover:bg-[#d8ddd8]/40"
          aria-label="关闭"
        >
          <X size={18} />
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <p className="text-sm text-[#5a6670]">加载中…</p>
        ) : memories.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#5a6670]">
            这里还没有回忆，在下面写下第一条吧。
          </p>
        ) : (
          <ul className="space-y-3">
            {memories.map((m) => (
              <li
                key={m.id}
                className="rounded-lg border border-[#d8ddd8] bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-[#1f2937]">{m.title}</h3>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="text-[#5a6670] hover:text-[#c9798a]"
                    aria-label="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {m.note && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[#5a6670]">
                    {m.note}
                  </p>
                )}
                {m.photos.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {m.photos.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="aspect-square w-full rounded object-cover"
                      />
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[10px] text-[#5a6670]/70">
                  {new Date(m.createdAt).toLocaleString("zh-CN")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 新增表单 */}
      <div className="border-t border-[#d8ddd8] bg-white px-5 py-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="标题（例如：江边散步）"
          className="w-full rounded-md border border-[#d8ddd8] px-3 py-2 text-sm outline-none focus:border-[#c9798a]"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="写下这一刻…"
          rows={3}
          className="mt-2 w-full resize-none rounded-md border border-[#d8ddd8] px-3 py-2 text-sm outline-none focus:border-[#c9798a]"
        />
        <div className="mt-2 flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1 rounded-md border border-[#d8ddd8] px-2.5 py-1.5 text-xs text-[#5a6670] hover:bg-[#fafaf7]">
            <ImageIcon size={14} />
            添加照片
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
          {photos.length > 0 && (
            <span className="text-xs text-[#5a6670]">
              已选 {photos.length} 张
            </span>
          )}
          <button
            onClick={handleAdd}
            className="ml-auto flex items-center gap-1 rounded-md bg-[#c9798a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#b8667a]"
          >
            <Plus size={14} />
            添加
          </button>
        </div>
        {photos.length > 0 && (
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {photos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt=""
                className="aspect-square w-full rounded object-cover"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
