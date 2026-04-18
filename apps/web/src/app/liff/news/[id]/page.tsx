"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useLiff } from "../../LiffBoot";

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

export default function LiffNewsDetailPage() {
  const { status } = useLiff();
  const params = useParams();
  const id = params.id as string;

  const [post, setPost] = useState<NewsPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "ready") return;
    apiFetch<NewsPost>(`/news/${id}`)
      .then(setPost)
      .catch(() => setPost(null))
      .finally(() => setLoading(false));
  }, [id, status]);

  if (loading) return <div className="p-6 text-center text-sm text-slate-500">กำลังโหลด…</div>;
  if (!post) return <div className="p-6 text-center text-sm text-slate-500">ไม่พบประกาศ</div>;

  const dateStr = new Date(post.publishedAt ?? post.createdAt).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href="/liff/news" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt=""
          className="mb-3 w-full rounded-lg object-cover"
          style={{ maxHeight: "240px" }}
        />
      )}

      <article className="rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          {post.isPinned && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
              📌 ปักหมุด
            </span>
          )}
          <span className="text-xs text-slate-400">{dateStr}</span>
        </div>

        <h1 className="mb-3 text-lg font-bold text-slate-800">{post.title}</h1>

        <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
          {post.content}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
          {post.author?.fullName ? <span>โดย {post.author.fullName}</span> : <span />}
          <span>👁 {post.viewCount} ครั้ง</span>
        </div>
      </article>
    </div>
  );
}
