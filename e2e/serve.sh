#!/usr/bin/env bash
# Starts what the tests run against: an image of the site on :8080, and a stand-in for the webhook behind its
# contact form on :8098.   bash serve.sh portfolio:local
set -euo pipefail
image=${1:?"usage: serve.sh IMAGE"}
cd "$(dirname "$0")"

nohup node support/webhook.ts > webhook.log 2>&1 &
docker rm -f portfolio-under-test > /dev/null 2>&1 || true
# On the host's network, so the server can reach the stand-in as localhost.
docker run -d --name portfolio-under-test --network host \
  -e TRUST_PROXY=true -e CONTACT_WEBHOOK_URL=http://localhost:8098/ "$image" > /dev/null

for _ in $(seq 1 40); do
  if curl -fs -o /dev/null localhost:8080/api/health && curl -fs -o /dev/null localhost:8098; then
    echo "The site is on http://localhost:8080, its webhook on http://localhost:8098"
    exit 0
  fi
  sleep 0.5
done
echo "The site or the stand-in did not start:"
cat webhook.log
docker logs portfolio-under-test
exit 1
