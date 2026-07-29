import { useEffect, useState } from "react";

/**
 * Fetch a YouTube embed URL from a GitHub raw text file
 */
async function fetchYoutubeEmbedUrl(rawUrl: string): Promise<string | null> {
  try {
    console.log("Fetching from GitHub URL:", rawUrl);

    const res = await fetch(`${rawUrl}?t=${Date.now()}`, {
      cache: "no-store",
    });

    console.log("GitHub response status:", res.status, res.statusText);

    if (!res.ok) {
      console.error("Failed to fetch video URL:", res.status);
      return null;
    }

    const text = await res.text();
    console.log("Raw response text from GitHub:", text);

    const trimmed = text.trim();
    console.log("Trimmed text:", trimmed);

    // basic safety check
    if (!trimmed.includes("youtube.com")) {
      console.warn("Text does not include youtube.com");
      return null;
    }

    // convert shorts → embed
    if (trimmed.includes("youtube.com/shorts/")) {
      const id = trimmed.split("/shorts/")[1]?.split("?")[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    return trimmed;
  } catch (err) {
    console.error("Error fetching video URL:", err);
    return null;
  }
}

// ✅ Two separate GitHub sources (create a 2nd file in the repo)
const VIDEO_SOURCE_1 =
  "https://raw.githubusercontent.com/acraig11/coast-life-user-content/main/reels.txt";

const VIDEO_SOURCE_2 =
  "https://raw.githubusercontent.com/acraig11/coast-life-user-content/main/Reels2.txt";

export default function Home() {
  const [videoUrl1, setVideoUrl1] = useState<string | null>(null);
  const [videoUrl2, setVideoUrl2] = useState<string | null>(null);

  useEffect(() => {
    fetchYoutubeEmbedUrl(VIDEO_SOURCE_1).then((url) => {
      console.log("Final videoUrl1 being set:", url);
      setVideoUrl1(url);
    });

    fetchYoutubeEmbedUrl(VIDEO_SOURCE_2).then((url) => {
      console.log("Final videoUrl2 being set:", url);
      setVideoUrl2(url);
    });
  }, []);

  const Video = ({ url, title }: { url: string; title: string }) => (
    <div
      style={{
        position: "relative",
        paddingBottom: "56.25%", // 16:9
        height: 0,
        overflow: "hidden",
        borderRadius: 12,
        boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
      }}
    >
      <iframe
        src={url}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: "none",
        }}
      />
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}> Welcome to Coast Life</h1>

      {/* 🎥 Two Featured Videos */}
      <div
        style={{
          marginTop: 24,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        {videoUrl1 && <Video url={videoUrl1} title="Featured Video 1" />}
        {videoUrl2 && <Video url={videoUrl2} title="Featured Video 2" />}
      </div>
    </div>
  );
}
