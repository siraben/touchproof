import type { Metadata } from "next";
import { Bricolage_Grotesque, Spline_Sans_Mono, STIX_Two_Text } from "next/font/google";
import "./styles.css";

// "The Drafting Table" type system, self-hosted at build time (static-export
// safe): Bricolage Grotesque for UI chrome, STIX Two Text for mathematics,
// Spline Sans Mono for code cards and the script view.
const ui = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-ui" });
const math = STIX_Two_Text({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-math" });
const mono = Spline_Sans_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "TouchProof",
  description: "Learn functional programming and theorem proving by touching the proof.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ui.variable} ${math.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
