import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "TouchProof",
  description: "Learn functional programming and theorem proving by touching the proof.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
