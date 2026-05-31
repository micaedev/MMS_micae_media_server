#!/bin/sh
set -eu

HOST="${MEDIASERVER_PUBLIC_HOST:-127.0.0.1}"
EXTRA="${WEBRTC_EXTRA_HOSTS:-127.0.0.1,localhost}"

# ICE: panelin acildigi tum adresler (localhost + LAN IP)
{
  echo "$EXTRA" | tr ',' '\n'
  echo "$HOST"
} | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' | sort -u | while read -r h; do
  printf '  - %s\n' "$h"
done > /tmp/webrtc_hosts.txt

awk '
  /__WEBRTC_HOSTS__/ {
    while ((getline line < "/tmp/webrtc_hosts.txt") > 0) print line
    next
  }
  { print }
' /mediaserver.yml.template > /mediaserver.yml

exec /mediaserver /mediaserver.yml
