"use client";

import Image from "next/image";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** An image that opens full size in a dialog. */
export function ZoomImage({
  src,
  fullSrc,
  alt,
  width,
  height,
  title,
}: {
  src: string;
  fullSrc?: string;
  alt: string;
  width: number;
  height: number;
  title: string;
}) {
  return (
    <Dialog>
      <DialogTrigger className="group block w-full cursor-zoom-in overflow-hidden bg-[#fdfdfc]" aria-label={`Enlarge: ${title}`}>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="h-auto w-full transition-transform duration-500 group-hover:scale-[1.02]"
          sizes="(min-width: 1024px) 700px, 100vw"
        />
      </DialogTrigger>
      <DialogContent className="max-w-[min(1400px,96vw)] bg-[#fdfdfc] p-3 sm:p-3">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Image src={fullSrc ?? src} alt={alt} width={width} height={height} className="h-auto w-full rounded-2xl" />
      </DialogContent>
    </Dialog>
  );
}
