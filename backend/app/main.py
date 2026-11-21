"""OpsWarden FastAPI application entrypoint."""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api.errors import ApiError
from app.api.routes import activity, approvals, assistant, auth, cases, documents, events, findings, team, workspaces
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.db import init_db

log = get_logger("opswarden.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    problems = settings.production_problems()
    if problems:
        # Fail the deploy loudly instead of running with a forgeable secret or a database that vanishes.
        raise RuntimeError("Refusing to start in production:\n- " + "\n- ".join(problems))
    init_db()
    from app.bootstrap import ensure_bootstrap_admin

    ensure_bootstrap_admin()
    if settings.seed_demo_data and not settings.is_production:
        from app.seed import seed

        seed()
        log.info("Demo seed data ensured")
    log.info("OpsWarden backend started (env=%s)", settings.opswarden_env)
    yield


app = FastAPI(
    title="OpsWarden API",
    version=__version__,
    description="Human-supervised AI procurement investigation platform.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # Accept the configured origin under both loopback hostnames in development.
    allow_origins=sorted({
        settings.frontend_origin,
        settings.frontend_origin.replace("localhost", "127.0.0.1"),
        settings.frontend_origin.replace("127.0.0.1", "localhost"),
    }),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or f"req_{uuid.uuid4().hex[:24]}"
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "request_id": getattr(request.state, "request_id", None),
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "The request failed validation.",
                "request_id": getattr(request.state, "request_id", None),
            }
        },
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    # Never leak stack traces or internal details to clients.
    log.exception("Unhandled error: %s", type(exc).__name__)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred.",
                "request_id": getattr(request.state, "request_id", None),
            }
        },
    )


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "version": __version__}


@app.get("/ready", tags=["system"])
def ready() -> dict:
    return {"status": "ready"}


API_PREFIX = "/api/v1"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(workspaces.router, prefix=API_PREFIX)
app.include_router(cases.router, prefix=API_PREFIX)
app.include_router(documents.router, prefix=API_PREFIX)
app.include_router(findings.router, prefix=API_PREFIX)
app.include_router(approvals.router, prefix=API_PREFIX)
app.include_router(activity.router, prefix=API_PREFIX)
app.include_router(team.router, prefix=API_PREFIX)
app.include_router(events.router, prefix=API_PREFIX)
app.include_router(assistant.router, prefix=API_PREFIX)
