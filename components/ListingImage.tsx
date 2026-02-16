"use client";

import { useEffect, useState } from "react";

export default function ListingImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [imgSrc, setImgSrc] = useState(src);

  // Keep state in sync when parent `src` changes.
  useEffect(() => {
    setImgSrc(src);
  }, [src]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc}
      alt={alt}
      className={["h-full w-full object-cover", className].filter(Boolean).join(" ")}
      loading="lazy"
      onError={() => setImgSrc("/images/placeholder.svg")}
    />
  );
}
