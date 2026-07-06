# DXC Ops & Deployment Dashboard

A small demo full-stack dashboard for a DevOps internship portfolio.

## Structure

- `backend/` – FastAPI app and SQLite database initialization.
- `frontend/` – Static HTML/CSS/vanilla JS dashboard.
- `backend/dxc_ops.db` – generated at runtime and ignored by git.

## Run locally

1. Create a Python virtual environment:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:

   ```bash
   pip install -r backend/requirements.txt
   ```

3. Start the backend API:

   ```bash
   cd backend
   uvicorn main:app --reload --port 8000
   ```

4. Open the frontend:

   Serve `frontend/` from a local file server. For example:

   ```bash
   cd frontend
   python3 -m http.server 8080
   ```

   Then open `http://localhost:8080` in your browser.

## Notes

- The frontend calls `http://localhost:8000/api/*`.
- The backend initializes the SQLite database and seeds realistic service, deployment, incident, and log data if the file does not exist.
- In a real DevOps deployment, the `POST /api/deployments` route would be backed by a queued rollout or pipeline task rather than an immediate success update.
- A future `/metrics` endpoint could expose Prometheus-friendly counters and histograms for request and deployment metrics.
