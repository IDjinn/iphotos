import { ImageOffIcon } from "lucide-react";
import type { CloudPhoto } from "@/data/cloud-photos-repository";
import { useAuthFileUrl } from "@/data/blob-cache";
import { Frame, Photo, SkeletonFill, Unavailable } from "./auth-image.styles";

interface AuthImageProps {
  photo: Pick<CloudPhoto, "id" | "fileName" | "width" | "height">;
  kind?: "thumbnail" | "preview";
  /** Fill the parent box (fixed size) instead of reserving an aspect ratio. */
  fill?: boolean;
  className?: string;
}

/**
 * Renders an authenticated photo variant. The exact aspect ratio is reserved
 * behind a skeleton while the blob loads (no layout shift), then the image
 * cross-fades in. Never a blank box that pops in.
 */
export function AuthImage({ photo, kind = "thumbnail", fill, className }: AuthImageProps) {
  const query = useAuthFileUrl(photo.id, kind);
  const url = query.data ?? null;
  const failed = query.isError;
  const ratio = photo.width && photo.height ? photo.width / photo.height : undefined;

  return (
    <Frame
      $ratio={fill ? undefined : ratio}
      $fill={fill}
      className={className}
      role="img"
      aria-label={photo.fileName}
    >
      <SkeletonFill />
      {url ? <Photo src={url} alt="" $visible /> : null}
      {failed ? (
        <Unavailable>
          <ImageOffIcon aria-hidden />
        </Unavailable>
      ) : null}
    </Frame>
  );
}
