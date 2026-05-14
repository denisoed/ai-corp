APP_NAME := ai-corp
BACKEND_PID_FILE := .aicorp-server.pid
BACKEND_LOG_FILE := .aicorp-server.log

.PHONY: bootstrap start restart stop status logs logs-web logs-backend

bootstrap:
	@echo "Checking npm dependencies..."
	@npm install
	@echo "Checking Docker compose configuration..."
	@docker compose config >/dev/null
	@mkdir -p .aicorp
	@echo "Bootstrap complete."

start:
	@mkdir -p .aicorp
	@# Clean up any leftover process on port 4000 before starting
	@lsof -ti :4000 | xargs kill 2>/dev/null || true
	@if [ -f "$(BACKEND_PID_FILE)" ] && kill -0 "$$(cat $(BACKEND_PID_FILE))" 2>/dev/null; then \
		echo "backend already running"; \
	else \
		nohup npm run dev:server > "$(BACKEND_LOG_FILE)" 2>&1 & echo $$! > "$(BACKEND_PID_FILE)"; \
		echo "started backend pid $$(cat $(BACKEND_PID_FILE))"; \
	fi
	@docker compose up -d web

restart: stop start

stop:
	@docker compose stop web
	@if [ -f "$(BACKEND_PID_FILE)" ]; then \
		kill "$$(cat $(BACKEND_PID_FILE))" 2>/dev/null || true; \
		rm -f "$(BACKEND_PID_FILE)"; \
	fi
	@# Kill any leftover node process on port 4000 (stale PID, manual start, etc.)
	@lsof -ti :4000 | xargs kill 2>/dev/null || true
	@echo "backend stopped"

status:
	@docker compose ps
	@if [ -f "$(BACKEND_PID_FILE)" ] && kill -0 "$$(cat $(BACKEND_PID_FILE))" 2>/dev/null; then \
		echo "backend: running (pid $$(cat $(BACKEND_PID_FILE)))"; \
	else \
		echo "backend: stopped"; \
	fi

logs:
	@tail -f "$(BACKEND_LOG_FILE)"

logs-backend:
	@tail -f "$(BACKEND_LOG_FILE)"

logs-web:
	@docker compose logs -f web
