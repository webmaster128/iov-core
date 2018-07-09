#!/bin/bash

PORT=${TM_PORT:-12345}
VERSION=${TM_VERSION:-0.20.0}

DIR="/tmp/tmtest/${VERSION}"

mkdir -p "${DIR}"
# be extra careful a missing variable doens't delete root
rm -rf "/tmp/tmtest/${VERSION}/{config,data}"

docker run -v "${DIR}:/tendermint" \
  tendermint/tendermint:${VERSION} init

docker run -p ${PORT}:26657 -v "${DIR}:/tendermint" \
  tendermint/tendermint:${VERSION} node \
  --proxy_app=kvstore \
  --rpc.laddr=tcp://0.0.0.0:26657 \
  --log_level=state:info,*:error