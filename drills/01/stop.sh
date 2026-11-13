#!/usr/bin/env bash
# Stop the server serve.sh started; its PID is in /tmp/portfolio-server.pid. (Matching on the
# command line instead would also match the shell make runs this from.)
PIDFILE=/tmp/portfolio-server.pid
if [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "server stopped"
else
  echo "no server running"
fi
rm -f "$PIDFILE"
