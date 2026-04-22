from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .database import Base, engine
from .api.routes.analyze import router as analyze_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Weightlifting Form Coach MVP")
app.mount("/static", StaticFiles(directory="app/data"), name="static")

app.include_router(analyze_router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
