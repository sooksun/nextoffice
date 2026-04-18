"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useLiff } from "../LiffBoot";

interface NewsPost {
  id: number;
  title: string;
  content: string;
  imageUrl: string | null;
  isPinned: boolean;
  publishedAt: string | null;
  createdAt: string;
  viewCount: number;
  author?: { id: number; fullName: string } | null;
}

export default function LiffNewsPage() {
  const { status } = useLiff();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "ready") return;
    apiFetch<{ total: number; data: NewsPost[] } | NewsPost[]>("/news?status=published")
      .then((d) => {
        const list = Array.isArray(d) ? d : d.data ?? [];
        setPosts(list);
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [status]);

  const pinned = posts.filter((p) => p.isPinned);
  const regular = posts.filter((p) => !p.isPinned);

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href="/liff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <h1 className="mb-4 text-lg font-semibold">ประกาศ / ข่าวสาร</h1>

      {loading && <div className="text-center text-sm text-slate-500">กำลังโหลด…</div>}

      {!loading && posts.length === 0 && (
        <div className="rounded-lg bg-white p-8 text-center text-sm text-slate-500">
          ยังไม่มีประกาศ
        </div>
      )}

      {!loading && (
        <>
          {pinned.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                📌 ปักหมุด
              </h2>
              <div className="space-y-2">
                {pinned.map((p) => (
                  <NewsCard key={p.id} post={p} pinned />
                ))}
              </div>
            </section>
          )}

          {regular.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                ล่าสุด
              </h2>
              <div className="space-y-2">
                {regular.map((p) => (
                  <NewsCard key={p.id} post={p} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function NewsCard({ post, pinned = false }: { post: NewsPost; pinned?: boolean }) {
  const dateStr = new Date(post.publishedAt ?? post.createdAt).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Link
      href={`/liff/news/${post.id}`}
      className={`block overflow-hidden rounded-lg border bg-white shadow-sm active:scale-[0.99] ${
        pinned ? "border-amber-300" : "border-slate-200"
      }`}
    >
      {post.imageUrl && (
        <div
          className="h-32 w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${post.imageUrl})` }}
        />
      )}
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold text-slate-800">{post.title}</p>
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{post.content}</p>
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
          <span>
            {dateStr}
            {post.author?.fullName && <> · {post.author.fullName}</>}
          </span>
          <span>👁 {post.viewCount}</span>
        </div>
      </div>
    </Link>
  );
}
