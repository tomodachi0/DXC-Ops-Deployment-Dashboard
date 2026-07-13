import random
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Generator, List, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import get_connection, initialize_database
from models import (
    Deployment,
    DeploymentCreate,
    HealthStatus,
    Incident,
    LogEntry,
    MetricsSummary,
    Service,
)

app = FastAPI(title="DXC Ops & Deployment Dashboard")

# Allow all origins for local development; restrict this in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    initialize_database()


def get_db() -> Generator[sqlite3.Connection, None, None]:
    db = get_connection()
    try:
        yield db
    finally:
        db.close()


def build_service(row: sqlite3.Row) -> Service:
    return Service(**dict(row))


def build_deployment(row: sqlite3.Row) -> Deployment:
    return Deployment(**dict(row))


def build_incident(row: sqlite3.Row) -> Incident:
    return Incident(**dict(row))


def build_log(row: sqlite3.Row) -> LogEntry:
    return LogEntry(**dict(row))


@app.get("/api/services", response_model=List[Service])
def list_services(
    environment: Optional[str] = Query(None), db: sqlite3.Connection = Depends(get_db)
):
    query = "SELECT * FROM services"
    params = []
    if environment:
        query += " WHERE environment = ?"
        params.append(environment)
    query += " ORDER BY id"
    rows = db.execute(query, params).fetchall()
    return [build_service(row) for row in rows]


@app.get("/api/services/{service_id}", response_model=Service)
def get_service(service_id: int, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT * FROM services WHERE id = ?", (service_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Service not found")
    return build_service(row)


@app.get("/api/services/{service_id}/logs", response_model=List[LogEntry])
def get_service_logs(service_id: int, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT id FROM services WHERE id = ?", (service_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Service not found")
    rows = db.execute(
        "SELECT * FROM logs WHERE service_id = ? ORDER BY logged_at DESC LIMIT 20",
        (service_id,),
    ).fetchall()
    return [build_log(row) for row in rows]


@app.get("/api/deployments", response_model=List[Deployment])
def list_deployments(
    environment: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: sqlite3.Connection = Depends(get_db),
):
    query = (
        "SELECT d.id, d.service_id, s.name AS service_name, d.version, d.environment, d.triggered_by, d.status, d.duration_seconds, d.deployed_at "
        "FROM deployments d "
        "JOIN services s ON d.service_id = s.id"
    )
    filters = []
    params = []
    if environment:
        filters.append("d.environment = ?")
        params.append(environment)
    if status:
        filters.append("d.status = ?")
        params.append(status)
    if filters:
        query += " WHERE " + " AND ".join(filters)
    query += " ORDER BY deployed_at DESC"
    rows = db.execute(query, params).fetchall()
    return [build_deployment(row) for row in rows]


@app.get("/api/incidents", response_model=List[Incident])
def list_incidents(
    status: Optional[str] = Query(None),
    db: sqlite3.Connection = Depends(get_db),
):
    query = (
        "SELECT i.id, i.service_id, s.name AS service_name, s.environment AS service_environment, i.title, i.severity, i.status, i.opened_at, i.resolved_at "
        "FROM incidents i "
        "JOIN services s ON i.service_id = s.id"
    )
    params = []
    if status:
        query += " WHERE i.status = ?"
        params.append(status)
    query += " ORDER BY opened_at DESC"
    rows = db.execute(query, params).fetchall()
    return [build_incident(row) for row in rows]


@app.get("/api/metrics/summary", response_model=MetricsSummary)
def metrics_summary(db: sqlite3.Connection = Depends(get_db)):
    averages = db.execute(
        "SELECT AVG(uptime_percent) AS avg_uptime FROM services"
    ).fetchone()
    active_services = db.execute("SELECT COUNT(*) AS total FROM services").fetchone()[0]
    deployments_today = db.execute(
        "SELECT COUNT(*) FROM deployments WHERE DATE(deployed_at) = DATE('now')"
    ).fetchone()[0]
    open_incidents = db.execute(
        "SELECT COUNT(*) FROM incidents WHERE status != 'resolved'"
    ).fetchone()[0]
    return MetricsSummary(
        avg_uptime=round(averages["avg_uptime"] or 0.0, 2),
        active_services=active_services,
        deployments_today=deployments_today,
        open_incidents=open_incidents,
    )


@app.get("/api/health", response_model=HealthStatus)
def health():
    return HealthStatus(status="ok")


@app.post("/api/deployments", response_model=Deployment)
def create_deployment(
    payload: DeploymentCreate,
    background_tasks: BackgroundTasks,
    db: sqlite3.Connection = Depends(get_db),
):
    now = datetime.utcnow().isoformat() + "Z"
    duration_seconds = random.randint(10, 60)
    cursor = db.execute(
        "INSERT INTO deployments (service_id, version, environment, triggered_by, status, duration_seconds, deployed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            payload.service_id,
            payload.version,
            payload.environment,
            "manual-trigger",
            "in_progress",
            duration_seconds,
            now,
        ),
    )
    deployment_id = cursor.lastrowid

    # For this demo the deployment is immediately marked successful so the endpoint stays synchronous.
    # In a production-ready pipeline, this would be represented by a background worker or async task.
    db.execute(
        "UPDATE deployments SET status = ? WHERE id = ?",
        ("success", deployment_id),
    )
    db.commit()

    row = db.execute(
        "SELECT d.id, d.service_id, s.name AS service_name, d.version, d.environment, d.triggered_by, d.status, d.duration_seconds, d.deployed_at "
        "FROM deployments d JOIN services s ON d.service_id = s.id WHERE d.id = ?",
        (deployment_id,),
    ).fetchone()
    return build_deployment(row)


# DEV: serve the static frontend so visiting http://localhost:8000/ returns index.html.
# In production, serve static assets from a dedicated webserver (nginx) or CDN.


frontend_dir = Path(__file__).parent.parent / "frontend"


if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
