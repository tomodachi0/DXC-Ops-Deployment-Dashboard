import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
import random

DB_PATH = Path(__file__).parent / "dxc_ops.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def initialize_database():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            environment TEXT NOT NULL,
            status TEXT NOT NULL,
            latency_ms INTEGER NOT NULL,
            uptime_percent REAL NOT NULL,
            cpu_usage_percent INTEGER NOT NULL,
            memory_usage_percent INTEGER NOT NULL,
            last_checked_at TEXT NOT NULL
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS deployments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_id INTEGER NOT NULL REFERENCES services(id),
            version TEXT NOT NULL,
            environment TEXT NOT NULL,
            triggered_by TEXT NOT NULL,
            status TEXT NOT NULL,
            duration_seconds INTEGER NOT NULL,
            deployed_at TEXT NOT NULL
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_id INTEGER NOT NULL REFERENCES services(id),
            title TEXT NOT NULL,
            severity TEXT NOT NULL,
            status TEXT NOT NULL,
            opened_at TEXT NOT NULL,
            resolved_at TEXT
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_id INTEGER NOT NULL REFERENCES services(id),
            level TEXT NOT NULL,
            message TEXT NOT NULL,
            logged_at TEXT NOT NULL
        )
        """
    )

    conn.commit()

    existing_services = cursor.execute("SELECT COUNT(*) FROM services").fetchone()[0]
    if existing_services == 0:
        seed_data(conn)
        conn.commit()

    conn.close()


def seed_data(conn: sqlite3.Connection):
    now = datetime.utcnow()
    rng = random.Random(43)
    service_records = [
        {
            "name": "auth-service",
            "environment": "production",
            "status": "healthy",
            "latency_ms": 78,
            "uptime_percent": 99.96,
            "cpu_usage_percent": 42,
            "memory_usage_percent": 58,
        },
        {
            "name": "payments-api",
            "environment": "production",
            "status": "degraded",
            "latency_ms": 238,
            "uptime_percent": 97.8,
            "cpu_usage_percent": 68,
            "memory_usage_percent": 74,
        },
        {
            "name": "billing-gateway",
            "environment": "staging",
            "status": "healthy",
            "latency_ms": 112,
            "uptime_percent": 99.4,
            "cpu_usage_percent": 36,
            "memory_usage_percent": 49,
        },
        {
            "name": "notification-worker",
            "environment": "dev",
            "status": "healthy",
            "latency_ms": 42,
            "uptime_percent": 100.0,
            "cpu_usage_percent": 15,
            "memory_usage_percent": 23,
        },
        {
            "name": "user-profile-api",
            "environment": "production",
            "status": "down",
            "latency_ms": 0,
            "uptime_percent": 96.4,
            "cpu_usage_percent": 0,
            "memory_usage_percent": 0,
        },
        {
            "name": "search-service",
            "environment": "staging",
            "status": "degraded",
            "latency_ms": 189,
            "uptime_percent": 98.6,
            "cpu_usage_percent": 55,
            "memory_usage_percent": 63,
        },
        {
            "name": "reporting-engine",
            "environment": "production",
            "status": "healthy",
            "latency_ms": 131,
            "uptime_percent": 99.12,
            "cpu_usage_percent": 54,
            "memory_usage_percent": 66,
        },
        {
            "name": "gateway-proxy",
            "environment": "production",
            "status": "healthy",
            "latency_ms": 56,
            "uptime_percent": 99.83,
            "cpu_usage_percent": 48,
            "memory_usage_percent": 52,
        },
        {
            "name": "inventory-cache",
            "environment": "dev",
            "status": "healthy",
            "latency_ms": 31,
            "uptime_percent": 100.0,
            "cpu_usage_percent": 12,
            "memory_usage_percent": 19,
        },
    ]

    service_ids = []
    for service in service_records:
        updated_latency = service["latency_ms"] or rng.randint(20, 450)
        last_checked = now - timedelta(minutes=rng.randint(1, 6))
        cursor = conn.execute(
            "INSERT INTO services (name, environment, status, latency_ms, uptime_percent, cpu_usage_percent, memory_usage_percent, last_checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                service["name"],
                service["environment"],
                service["status"],
                updated_latency,
                service["uptime_percent"],
                service["cpu_usage_percent"],
                service["memory_usage_percent"],
                last_checked.isoformat() + "Z",
            ),
        )
        service_ids.append(cursor.lastrowid)

    deployment_versions = ["v1.4.2", "v1.4.3", "v1.5.0", "v2.0.0-rc1", "v2.0.0", "v2.1.0", "v1.5.1"]
    deploy_statuses = ["success"] * 18 + ["failed", "rolled_back", "in_progress", "failed", "success", "success"]
    triggers = ["yassine.k", "ci-bot", "release-pipeline", "oncall.bot"]
    deployments = []
    for i in range(25):
        service_id = rng.choice(service_ids)
        version = rng.choice(deployment_versions)
        status = deploy_statuses[i % len(deploy_statuses)]
        deployed_at = now - timedelta(days=rng.randint(0, 6), hours=rng.randint(0, 23), minutes=rng.randint(0, 59))
        deployments.append(
            (
                service_id,
                version,
                rng.choice(["production", "staging", "dev"]),
                rng.choice(triggers),
                status,
                rng.randint(12, 220),
                deployed_at.isoformat() + "Z",
            )
        )

    deployments.sort(key=lambda row: row[6])
    conn.executemany(
        "INSERT INTO deployments (service_id, version, environment, triggered_by, status, duration_seconds, deployed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        deployments,
    )

    incident_titles = [
        "Elevated latency on payments-api",
        "Database connection pool exhausted",
        "Health check timeout for user-profile-api",
        "Partial failure in reporting-engine batch export",
        "Gateway proxy TLS negotiation errors",
        "Notification queue backlog is rising",
        "Search-service index refresh failed",
    ]
    severities = ["low", "medium", "high", "critical"]
    incident_status = ["open", "investigating", "resolved"]
    incidents = []
    for idx, title in enumerate(incident_titles):
        service_id = service_ids[idx % len(service_ids)]
        severity = rng.choice(severities)
        status = rng.choice(incident_status)
        opened_at = now - timedelta(days=rng.randint(0, 6), hours=rng.randint(0, 12), minutes=rng.randint(0, 59))
        resolved_at = None
        if status == "resolved":
            resolved_at = opened_at + timedelta(hours=rng.randint(1, 36))
            if resolved_at > now:
                resolved_at = now - timedelta(minutes=rng.randint(5, 30))
        incidents.append(
            (
                service_id,
                title,
                severity,
                status,
                opened_at.isoformat() + "Z",
                resolved_at.isoformat() + "Z" if resolved_at else None,
            )
        )

    conn.executemany(
        "INSERT INTO incidents (service_id, title, severity, status, opened_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?)",
        incidents,
    )

    log_levels = ["INFO", "WARN", "ERROR"]
    log_messages = [
        "Connection pool at 82% capacity",
        "Request completed in 340ms",
        "Retry attempt 2/3 for upstream call",
        "Health check passed",
        "Cache refresh completed successfully",
        "Unexpected timeout in external payment gateway",
        "Worker heartbeat received",
        "Circuit breaker opened for 30 seconds",
        "Schema migration applied on shard 2",
        "Auth token validation succeeded",
        "Failed to write event to audit log",
        "Memory pressure above 70%",
    ]

    logs = []
    for service_id in service_ids:
        count = rng.randint(10, 15)
        for entry_index in range(count):
            level = rng.choices(log_levels, weights=[65, 25, 10])[0]
            message = rng.choice(log_messages)
            timestamp = now - timedelta(days=rng.randint(0, 6), hours=rng.randint(0, 23), minutes=rng.randint(0, 59), seconds=rng.randint(0, 59))
            logs.append((service_id, level, message, timestamp.isoformat() + "Z"))

    logs.sort(key=lambda row: row[3], reverse=True)
    conn.executemany(
        "INSERT INTO logs (service_id, level, message, logged_at) VALUES (?, ?, ?, ?)",
        logs,
    )
