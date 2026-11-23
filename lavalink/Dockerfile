FROM ghcr.io/lavalink-devs/lavalink:4

USER root
COPY application.yml /opt/Lavalink/application.yml
COPY entrypoint.sh /opt/Lavalink/entrypoint.sh
RUN sed -i 's/\r$//' /opt/Lavalink/entrypoint.sh /opt/Lavalink/application.yml \
    && chmod +x /opt/Lavalink/entrypoint.sh \
    && mkdir -p /opt/Lavalink/plugins /opt/Lavalink/logs \
    && chown -R lavalink:lavalink /opt/Lavalink

USER lavalink
WORKDIR /opt/Lavalink
ENTRYPOINT ["/opt/Lavalink/entrypoint.sh"]
