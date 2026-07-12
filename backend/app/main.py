from fastapi import FastAPI

app = FastAPI(
    title="PBC Visitor Kiosk",
    version="0.1"
)

@app.get("/")
def root():
    return {
        "application": "PBC Visitor Kiosk",
        "version": "0.1"
    }

@app.get("/health")
def health():
    return {
        "status": "healthy"
    }