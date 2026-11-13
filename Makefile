# Break-fix drill 01 (this branch only): see drills/01/README.md.
.PHONY: drill check stop

drill:
	@bash drills/01/start.sh

check:
	@bash drills/01/check.sh

stop:
	@bash drills/01/stop.sh
