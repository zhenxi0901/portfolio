import { Source_Serif_4 } from "next/font/google";

/**
 * The serif for long reads: posts, postmortems and the decision records. Only those pages import it,
 * so only they load (and preload) its files; everything else is IBM Plex. Put `serif.variable` on the
 * page's frame (ArticleShell's className) and use `font-serif`.
 */
export const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], style: ["normal", "italic"] });
