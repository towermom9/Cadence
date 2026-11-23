#!/bin/sh
set -e

fetch_latest_maven_version() {
  url="$1"
  fallback="$2"
  ver=$(curl -fsSL --max-time 6 "$url" 2>/dev/null | sed -n 's/.*<latest>\([^<]*\)<\/latest>.*/\1/p' | head -n 1)
  if [ -n "$ver" ]; then
    echo "$ver"
  else
    echo "$fallback"
  fi
}

if [ -z "$YT_PLUGIN_VERSION" ]; then
  YT_PLUGIN_VERSION=$(fetch_latest_maven_version \
    "https://maven.lavalink.dev/snapshots/dev/lavalink/youtube/youtube-plugin/maven-metadata.xml" \
    "e41dd95f8bd134b51e75080fb28cc805fecb431a")
  export YT_PLUGIN_VERSION
fi

if [ -z "$LAVASRC_PLUGIN_VERSION" ]; then
  LAVASRC_PLUGIN_VERSION=$(fetch_latest_maven_version \
    "https://maven.lavalink.dev/releases/com/github/topi314/lavasrc/lavasrc-plugin/maven-metadata.xml" \
    "4.8.3")
  export LAVASRC_PLUGIN_VERSION
fi

if [ -z "$LAVALYRICS_PLUGIN_VERSION" ]; then
  LAVALYRICS_PLUGIN_VERSION=$(fetch_latest_maven_version \
    "https://maven.lavalink.dev/releases/com/github/topi314/lavalyrics/lavalyrics-plugin/maven-metadata.xml" \
    "1.1.0")
  export LAVALYRICS_PLUGIN_VERSION
fi

echo "[Cadence-Lavalink] Plugin versions: youtube-plugin=${YT_PLUGIN_VERSION} (beta/snapshot), lavasrc-plugin=${LAVASRC_PLUGIN_VERSION}, lavalyrics-plugin=${LAVALYRICS_PLUGIN_VERSION}"

exec java -jar Lavalink.jar "$@"
