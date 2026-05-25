#!/bin/sh
set -eu

HOST="${MTX_PUBLIC_HOST:-localhost}"
sed "s/__WEBRTC_HOST__/${HOST}/g" /mediamtx.yml.template > /mediamtx.yml
exec /mediamtx
