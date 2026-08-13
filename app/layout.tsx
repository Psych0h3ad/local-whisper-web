import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Local Whisper — 音声を、外に出さず文字にする";
const description =
  "インストールもログインも不要。音声・動画・マイク録音を送信せず、ブラウザ内のWhisperで文字起こしします。";

const LOCAL_METADATA_ORIGIN = "http://localhost:3000";

function getMetadataOrigin(): string {
  // Production must set this to the public origin. Request Host and proxy
  // headers are deliberately never used here: either can be attacker supplied.
  const configuredOrigin =
    process.env.PUBLIC_SITE_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL;

  if (!configuredOrigin) {
    return LOCAL_METADATA_ORIGIN;
  }

  try {
    const url = new URL(configuredOrigin);
    const isLoopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    const hasSafeProtocol =
      url.protocol === "https:" || (isLoopback && url.protocol === "http:");
    const isBareOrigin =
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password;

    return hasSafeProtocol && isBareOrigin
      ? url.origin
      : LOCAL_METADATA_ORIGIN;
  } catch {
    return LOCAL_METADATA_ORIGIN;
  }
}

export const metadata: Metadata = {
  metadataBase: new URL(getMetadataOrigin()),
  title,
  description,
  applicationName: "Local Whisper",
  authors: [{ name: "psych0h3ad" }],
  icons: { icon: "/favicon.svg" },
  keywords: ["Whisper", "文字起こし", "STT", "ローカルAI", "音声認識"],
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "Local Whisper",
    title,
    description,
    url: "/",
    images: [
      {
        url: "/og-preview.png",
        width: 1200,
        height: 630,
        alt: "音声波形が、端末内の安全な処理を経て文章に変わるイラスト",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-preview.png"],
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f3f0e8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
