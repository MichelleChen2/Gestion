.PHONY: help up down restart rebuild rebuild-clean destroy destroy-all logs logs-app logs-db ps status shell-app shell-db db-shell

DOCKER_COMPOSE = docker compose

help: ## Muestra este menu de ayuda con los comandos disponibles
	@echo ============================================================
	@echo             COMANDOS DOCKER - COOPGESTION
	@echo ============================================================
	@echo Uso: make [comando]
	@echo.
	@echo Comandos de ciclo de vida:
	@echo   make up            - Levanta los contenedores en segundo plano
	@echo   make down          - Detiene los contenedores (preserva datos)
	@echo   make restart       - Reinicia todos los servicios
	@echo   make rebuild       - Recompila y aplica nuevos cambios de codigo
	@echo   make rebuild-clean - Recompila desde cero sin cache
	@echo   make destroy       - Destruye contenedores y volumenes (resetea BD)
	@echo   make destroy-all   - Destruye contenedores, volumenes e imagenes
	@echo.
	@echo Diagnostico y logs:
	@echo   make ps            - Muestra el estado de los contenedores
	@echo   make logs          - Muestra logs en tiempo real de todos los servicios
	@echo   make logs-app      - Sigue los logs del backend Node.js
	@echo   make logs-db       - Sigue los logs de PostgreSQL
	@echo.
	@echo Acceso interactivo:
	@echo   make shell-app     - Abre una consola dentro del contenedor app
	@echo   make shell-db      - Abre psql directamente en la base de datos
	@echo ============================================================

up: ## Levanta los servicios en segundo plano
	$(DOCKER_COMPOSE) up -d

down: ## Detiene los servicios sin borrar datos
	$(DOCKER_COMPOSE) down

restart: ## Reinicia los servicios
	$(DOCKER_COMPOSE) restart

rebuild: ## Recompila la app y levanta con los nuevos cambios
	$(DOCKER_COMPOSE) up -d --build

rebuild-clean: ## Recompila sin cache y recrea los contenedores
	$(DOCKER_COMPOSE) build --no-cache
	$(DOCKER_COMPOSE) up -d --force-recreate

destroy: ## Elimina contenedores, redes y volumenes (resetea base de datos)
	$(DOCKER_COMPOSE) down -v --remove-orphans

destroy-all: ## Elimina contenedores, volumenes e imagenes creadas
	$(DOCKER_COMPOSE) down -v --rmi all --remove-orphans

ps: ## Muestra el estado de los contenedores
	$(DOCKER_COMPOSE) ps

status: ps

logs: ## Muestra logs en tiempo real
	$(DOCKER_COMPOSE) logs -f

logs-app: ## Muestra logs del servicio app
	$(DOCKER_COMPOSE) logs -f app

logs-db: ## Muestra logs de PostgreSQL
	$(DOCKER_COMPOSE) logs -f db

shell-app: ## Abre consola interactiva dentro del contenedor app
	$(DOCKER_COMPOSE) exec app sh

shell-db: ## Abre la consola de PostgreSQL (psql)
	$(DOCKER_COMPOSE) exec db psql -U coopgestion -d coopgestion

db-shell: shell-db
