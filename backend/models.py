from typing import Optional

from pydantic import BaseModel


class Service(BaseModel):
    id: int
    name: str
    environment: str
    status: str
    latency_ms: int
    uptime_percent: float
    cpu_usage_percent: int
    memory_usage_percent: int
    last_checked_at: str


class Deployment(BaseModel):
    id: int
    service_id: int
    service_name: str
    version: str
    environment: str
    triggered_by: str
    status: str
    duration_seconds: int
    deployed_at: str


class DeploymentCreate(BaseModel):
    service_id: int
    version: str
    environment: str


class Incident(BaseModel):
    id: int
    service_id: int
    service_name: str
    service_environment: str
    title: str
    severity: str
    status: str
    opened_at: str
    resolved_at: Optional[str] = None


class LogEntry(BaseModel):
    id: int
    service_id: int
    level: str
    message: str
    logged_at: str


class MetricsSummary(BaseModel):
    avg_uptime: float
    active_services: int
    deployments_today: int
    open_incidents: int


class HealthStatus(BaseModel):
    status: str
