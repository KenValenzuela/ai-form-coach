from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import Base, engine
from .api.routes.analyze import router as analyze_router
from .api.routes.workouts import router as workout_router
from .utils.data_paths import (
    FRAMES_DIR,
    OVERLAYS_DIR,
    PREVIEWS_DIR,
    PROCESSED_DIR,
    TRACKING_DIR,
    UPLOADS_DIR,
    ensure_data_dirs,
)

Base.metadata.create_all(bind=engine)
ensure_data_dirs()

app = FastAPI(title="AI Weightlifting Form Coach MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_MOUNTS: dict[str, Path] = {
    "/uploads": UPLOADS_DIR,
    "/processed": PROCESSED_DIR,
    "/tracking": TRACKING_DIR,
    "/overlays": OVERLAYS_DIR,
    "/previews": PREVIEWS_DIR,
    "/frames": FRAMES_DIR,
}

for route, directory in STATIC_MOUNTS.items():
    directory.mkdir(parents=True, exist_ok=True)
    app.mount(route, StaticFiles(directory=str(directory)), name=route.replace("/", "_").strip("_"))

app.include_router(analyze_router, prefix="/api")
app.include_router(workout_router, prefix="/api")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "static_dirs": {
            route: {
                "path": str(directory.resolve()),
                "exists": directory.exists(),
            }
            for route, directory in STATIC_MOUNTS.items()
        },
    }
