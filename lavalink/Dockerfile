FROM ghcr.io/lavalink-devs/lavalink:4

USER root
COPY application.yml /opt/Lavalink/application.yml
COPY entrypoint.sh /opt/Lavalink/entrypoint.sh

# Resolve latest plugin versions at build time and pre-bundle JARs for fast, offline-resilient startup
RUN sed -i 's/\r$//' /opt/Lavalink/entrypoint.sh /opt/Lavalink/application.yml \
    && chmod +x /opt/Lavalink/entrypoint.sh \
    && mkdir -p /opt/Lavalink/plugins /opt/Lavalink/bundled-plugins /opt/Lavalink/logs \
    && YT_VER=$(curl -fsSL "https://maven.lavalink.dev/snapshots/dev/lavalink/youtube/youtube-plugin/maven-metadata.xml" | sed -n 's/.*<latest>\([^<]*\)<\/latest>.*/\1/p' | head -n 1) \
    && YT_VER=${YT_VER:-e41dd95f8bd134b51e75080fb28cc805fecb431a} \
    && LAVASRC_VER=$(curl -fsSL "https://maven.lavalink.dev/releases/com/github/topi314/lavasrc/lavasrc-plugin/maven-metadata.xml" | sed -n 's/.*<latest>\([^<]*\)<\/latest>.*/\1/p' | head -n 1) \
    && LAVASRC_VER=${LAVASRC_VER:-4.8.3} \
    && LAVALYRICS_VER=$(curl -fsSL "https://maven.lavalink.dev/releases/com/github/topi314/lavalyrics/lavalyrics-plugin/maven-metadata.xml" | sed -n 's/.*<latest>\([^<]*\)<\/latest>.*/\1/p' | head -n 1) \
    && LAVALYRICS_VER=${LAVALYRICS_VER:-1.1.0} \
    && echo "BAKED_YT_PLUGIN_VERSION=${YT_VER}" > /opt/Lavalink/plugin-defaults.env \
    && echo "BAKED_LAVASRC_PLUGIN_VERSION=${LAVASRC_VER}" >> /opt/Lavalink/plugin-defaults.env \
    && echo "BAKED_LAVALYRICS_PLUGIN_VERSION=${LAVALYRICS_VER}" >> /opt/Lavalink/plugin-defaults.env \
    && curl -fsSL "https://maven.lavalink.dev/snapshots/dev/lavalink/youtube/youtube-plugin/${YT_VER}/youtube-plugin-${YT_VER}.jar" -o "/opt/Lavalink/bundled-plugins/youtube-plugin-${YT_VER}.jar" \
    && curl -fsSL "https://maven.lavalink.dev/releases/com/github/topi314/lavasrc/lavasrc-plugin/${LAVASRC_VER}/lavasrc-plugin-${LAVASRC_VER}.jar" -o "/opt/Lavalink/bundled-plugins/lavasrc-plugin-${LAVASRC_VER}.jar" \
    && curl -fsSL "https://maven.lavalink.dev/releases/com/github/topi314/lavalyrics/lavalyrics-plugin/${LAVALYRICS_VER}/lavalyrics-plugin-${LAVALYRICS_VER}.jar" -o "/opt/Lavalink/bundled-plugins/lavalyrics-plugin-${LAVALYRICS_VER}.jar" \
    && cp /opt/Lavalink/bundled-plugins/*.jar /opt/Lavalink/plugins/ \
    && chown -R lavalink:lavalink /opt/Lavalink

# Run as root so bind-mounted Linux host directories (/opt/Lavalink/plugins, /opt/Lavalink/logs) never fail with AccessDeniedException
WORKDIR /opt/Lavalink
ENTRYPOINT ["/opt/Lavalink/entrypoint.sh"]
