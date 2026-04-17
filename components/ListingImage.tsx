"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export default function ListingImage({
  src,
  alt,
  className,
  sizes,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
}) {
  const [imgSrc, setImgSrc] = useState(src);

  useEffect(() => {
    setImgSrc(src);
  }, [src]);

  return (
    <Image
      src={imgSrc}
      alt={alt}
      fill
      sizes={sizes ?? "(max-width: 640px) 100vw, 33vw"}
      className={["h-full w-full object-cover", className].filter(Boolean).join(" ")}
      onError={() => setImgSrc("/images/placeholder.svg")}
    />
  );
}
