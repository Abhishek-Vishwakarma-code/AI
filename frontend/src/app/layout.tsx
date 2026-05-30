import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "OmniAgent | Production Multimodal AI Platform",
  description: "A secure, enterprise-grade multi-agent orchestration platform for deep research, local code synthesis, and local media generation.",
  keywords: ["AI agent", "multimodal", "stable diffusion", "local LLM", "search engine", "RAG"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={`${inter.variable} font-sans h-full bg-[#050508] text-gray-100 flex flex-col`}>
        {children}
      </body>
    </html>
  );
}
