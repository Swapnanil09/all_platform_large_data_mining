"""
QueryDeck — HTTP layer.

Run it with:  python run.py      (or)   uvicorn app:app --reload
Then open:    http://127.0.0.1:8000
"""

from __future__ import annotations

import os
import tempfile
import time

from fastapi import FastAPI, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.background import BackgroundTask

import db

app = FastAPI(title="QueryDeck", version="1.0")

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #

class ConnectionIn(BaseModel):
    name: str | None = None
    engine: str = "mysql"
    host: str
    port: int | None = None
    user: str | None = None
    password: str | None = None
    database: str | None = None
    provider: str | None = None
    secure: bool = True
    skip_verify: bool = False


class QueryIn(BaseModel):
    conn: str
    sql: str
    page: int = 0
    page_size: int = 200


# --------------------------------------------------------------------------- #
# Connections
# --------------------------------------------------------------------------- #

@app.get("/api/connections")
def list_connections():
    return db.public_connections()


@app.post("/api/connections")
def create_connection(payload: ConnectionIn):
    try:
        return db.add_connection(payload.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=f"Database storage permission error: {e}. Please ensure the directory is writable or set QUERYDECK_DATA_DIR.")


@app.post("/api/connections/test")
def test_connection(payload: ConnectionIn):
    return db.test_connection(payload.model_dump())


@app.delete("/api/connections/{conn_id}")
def remove_connection(conn_id: str):
    try:
        db.delete_connection(conn_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except db.ConnectionError_ as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Schema + query
# --------------------------------------------------------------------------- #

@app.get("/api/schema")
def schema(conn: str):
    cfg = _require(conn)
    try:
        return db.get_schema(cfg)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=db._friendly_error(e))


@app.post("/api/query")
def query(payload: QueryIn):
    cfg = _require(payload.conn)
    if not payload.sql.strip():
        raise HTTPException(status_code=400, detail="Write a query to run.")
    try:
        return db.run_query(cfg, payload.sql, payload.page, payload.page_size)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=db._friendly_error(e))


# --------------------------------------------------------------------------- #
# Export — form POST so the browser streams straight to disk
# --------------------------------------------------------------------------- #

@app.post("/api/export")
def export(conn: str = Form(...), sql: str = Form(...), fmt: str = Form("csv")):
    cfg = _require(conn)
    if not sql.strip():
        raise HTTPException(status_code=400, detail="Write a query to export.")
    stamp = time.strftime("%Y%m%d_%H%M%S")
    fmt = (fmt or "csv").lower()

    if fmt == "xlsx":
        tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
        tmp.close()
        try:
            res = db.export_xlsx(cfg, sql, tmp.name)
            rows = res.get("rows", 0)
        except Exception as e:
            import traceback
            traceback.print_exc()
            _safe_unlink(tmp.name)
            raise HTTPException(status_code=400, detail=db._friendly_error(e))
        return FileResponse(
            tmp.name,
            media_type=XLSX_MIME,
            filename=f"querydeck_{stamp}_{rows}_rows.xlsx",
            background=BackgroundTask(_safe_unlink, tmp.name),
        )

    # CSV (default): open the cursor eagerly so a bad query fails cleanly here.
    try:
        stream = db.export_csv(cfg, sql)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=db._friendly_error(e))
    headers = {"Content-Disposition": f'attachment; filename="querydeck_{stamp}.csv"'}
    return StreamingResponse(stream, media_type="text/csv; charset=utf-8", headers=headers)


# --------------------------------------------------------------------------- #
# Static frontend
# --------------------------------------------------------------------------- #

app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _require(conn_id: str) -> dict:
    try:
        return db.require_connection(conn_id)
    except db.ConnectionError_ as e:
        raise HTTPException(status_code=404, detail=str(e))


def _safe_unlink(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass
