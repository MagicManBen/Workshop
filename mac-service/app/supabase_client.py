"""Thin Supabase (PostgREST) client for the printing service.

Uses the service-role key server-side only. All calls target the `workshop`
schema via the Content-Profile / Accept-Profile headers. Kept intentionally
small: we only need to call a few RPCs and read/insert print jobs.
"""

from __future__ import annotations

from typing import Any

import httpx

from . import settings


class SupabaseError(RuntimeError):
    pass


def _headers(write: bool = False) -> dict[str, str]:
    key = settings.SUPABASE_SERVICE_ROLE_KEY
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": settings.SUPABASE_SCHEMA,
    }
    if write:
        h["Content-Profile"] = settings.SUPABASE_SCHEMA
        h["Content-Type"] = "application/json"
    return h


def rpc(name: str, params: dict[str, Any]) -> Any:
    """Call a Postgres function exposed via PostgREST."""
    url = f"{settings.SUPABASE_URL}/rest/v1/rpc/{name}"
    try:
        resp = httpx.post(url, json=params, headers=_headers(write=True), timeout=15)
    except httpx.HTTPError as exc:
        raise SupabaseError(f"RPC {name} transport error: {exc}") from exc
    if resp.status_code >= 400:
        raise SupabaseError(f"RPC {name} failed ({resp.status_code}): {resp.text}")
    if resp.text.strip():
        return resp.json()
    return None


def claim_next_print_job(worker_id: str) -> dict | None:
    rows = rpc("claim_next_print_job", {"p_worker_id": worker_id})
    if isinstance(rows, list) and rows:
        return rows[0]
    return None


def complete_print_job(job_id: str, worker_id: str, success: bool,
                       error: str | None = None) -> Any:
    return rpc("complete_print_job", {
        "p_job_id": job_id,
        "p_worker_id": worker_id,
        "p_success": success,
        "p_error": error,
    })


def record_heartbeat(service_name: str, status: str = "online",
                     detail: dict | None = None) -> Any:
    return rpc("record_heartbeat", {
        "p_service_name": service_name,
        "p_status": status,
        "p_detail": detail or {},
    })


def insert_print_job(box_code: str, box_id: str | None = None,
                     payload: dict | None = None) -> dict:
    """Enqueue a print job (used for end-to-end testing from this service)."""
    url = f"{settings.SUPABASE_URL}/rest/v1/print_jobs"
    body = {"box_code": box_code, "box_id": box_id, "payload": payload or {}}
    headers = _headers(write=True) | {"Prefer": "return=representation"}
    resp = httpx.post(url, json=body, headers=headers, timeout=15)
    if resp.status_code >= 400:
        raise SupabaseError(f"insert print_job failed ({resp.status_code}): {resp.text}")
    return resp.json()[0]
