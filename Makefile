.PHONY: dev dev-backend dev-desktop build-macos

BACKEND_VENV=backend/.venv
BACKEND_PY=$(BACKEND_VENV)/bin/python


dev-backend:
	./backend/run_with_env.sh


dev-desktop:
	cd apps/desktop && npm install
	cd apps/desktop && npm run dev


dev:
	./backend/run_with_env.sh &
	cd apps/desktop && npm install
	cd apps/desktop && npm run dev

build-macos:
	scripts/build_backend.sh
	cd apps/desktop && npm install
	cd apps/desktop && npm run build
	cd apps/desktop && npm run tauri build
