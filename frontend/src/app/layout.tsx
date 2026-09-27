import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "./providers";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatProvider } from "@/features/chat/ChatContext";
import { ChatPanel } from "@/features/chat/components/ChatPanel";
import { ChatLauncher } from "@/features/chat/components/ChatLauncher";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Expense Tracker",
  description: "Track and review what you spend",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} h-full antialiased`}>
      <body className="flex min-h-full bg-slate-50 font-sans text-slate-900">
        <Providers>
          <ChatProvider>
            <Sidebar />
            <main className="flex min-w-0 flex-grow flex-col gap-6 px-10 py-8">{children}</main>
            <ChatPanel />
            <ChatLauncher />
          </ChatProvider>
        </Providers>
      </body>
    </html>
  );
}
