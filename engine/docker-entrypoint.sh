#!/bin/sh
set -eu

HOST="${MEDIASERVER_PUBLIC_HOST:-localhost}"
sed "s/__WEBRTC_HOST__/${HOST}/g" /mediaserver.yml.template > /mediaserver.yml
exec /mediaserver /mediaserver.yml
