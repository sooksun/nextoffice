import { Bot, MessageSquareText } from "lucide-react";

export const metadata = {
  title: "AI สารบรรณ Chat — NextOffice",
};

export default function ChatPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="bg-secondary/10 p-6 rounded-3xl mb-5">
        <Bot size={40} className="text-secondary" />
      </div>
      <h2 className="text-xl font-bold text-on-surface mb-2">AI สารบรรณ</h2>
      <p className="text-sm text-on-surface-variant mb-6 max-w-md leading-relaxed">
        ผู้ช่วยตอบคำถามเรื่องระเบียบงานสารบรรณ หนังสือราชการ
        และการจัดการเอกสาร — ตอบโดยใช้ข้อมูลจาก RAG
      </p>
      <div className="flex items-center gap-2 text-sm text-on-surface-variant bg-surface-low border border-outline-variant/20 rounded-2xl px-5 py-3">
        <MessageSquareText size={16} className="text-secondary" />
        <span>คลิกปุ่ม <strong className="text-secondary">แชท</strong> ที่มุมขวาล่างเพื่อเริ่มสนทนา</span>
      </div>
    </div>
  );
}
