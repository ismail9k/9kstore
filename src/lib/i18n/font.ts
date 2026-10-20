import { IBM_Plex_Sans_Arabic } from "next/font/google";

export const plex = IBM_Plex_Sans_Arabic({
  weight: ["400", "600", "700"],
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-plex",
});
