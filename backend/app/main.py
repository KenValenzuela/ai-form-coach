from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .database import Base, engine
from .api.routes.analyze import router as analyze_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Weightlifting Form Coach MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="app/data"), name="static")
app.include_router(analyze_router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
