import { Fragment } from "react";
import { splitArtists } from "@shared/artists";

interface Props {
  author: string;
  onOpenArtist: (artistName: string) => void;
  className?: string;
}

export function ArtistLinks({ author, onOpenArtist, className = "" }: Props) {
  const artists = splitArtists(author);
  if (artists.length === 0) {
    return <span>{author || "Unknown Artist"}</span>;
  }

  return (
    <>
      {artists.map((name, idx) => (
        <Fragment key={`${name}-${idx}`}>
          {idx > 0 && <span className="text-zinc-500">, </span>}
          <button
            type="button"
            data-inline-btn="true"
            onClick={(e) => {
              e.stopPropagation();
              onOpenArtist(name);
            }}
            className={`hover:text-white hover:underline ${className}`}
          >
            {name}
          </button>
        </Fragment>
      ))}
    </>
  );
}
