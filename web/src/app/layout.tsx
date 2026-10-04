import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { StyledComponentsRegistry } from "@/components/providers/styled-components-registry";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "iPhotos",
    template: "%s · iPhotos",
  },
  description: "Your photos, everywhere.",
};

// Dark is the shipped default; a stored choice (dark/light/system) wins.
const themeScript = `(function(){var m;try{m=localStorage.getItem("iphotos.theme")}catch(e){}if(m!=="dark"&&m!=="light"&&m!=="system")m="dark";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <StyledComponentsRegistry>
          <AppProviders>{children}</AppProviders>
        </StyledComponentsRegistry>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
