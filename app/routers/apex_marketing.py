# app/routers/apex_marketing.py
"""
Apex Marketing AI Employee proxy endpoints.

The real AI Employee runs in Supervity Auto. This router keeps the browser
away from Supervity credentials and normalizes run/review responses for the
Command Center UI without re-implementing agent logic locally.
"""

import json
import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field


router = APIRouter(prefix="/apex-marketing", tags=["Apex Marketing"])


class CampaignBrief(BaseModel):
    campaign_name: str = ""
    product_offer: str = ""
    audience: str = ""
    campaign_goal: str = ""
    core_message: str = ""
    key_benefits: list[str] = Field(default_factory=list)
    tone: str = ""
    cta_link: str = ""
    target_channels: list[str] = Field(default_factory=list)
    success_metric: str = ""


class CampaignRunRequest(BaseModel):
    triggered_by: str = "Aarushi"
    campaign_brief: CampaignBrief
    test_mode: str = "happy_path"


class ReviewSubmitRequest(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)


def _api_base() -> str:
    return os.getenv(
        "SUPERVITY_WORKFLOW_API_BASE",
        "https://auto-workflow-api.supervity.ai",
    ).rstrip("/")


def _execute_path() -> str:
    path = os.getenv(
        "SUPERVITY_WORKFLOW_EXECUTE_STREAM_PATH",
        "/api/v1/workflow-runs/execute/stream",
    )
    return path if path.startswith("/") else f"/{path}"


def _workflow_id() -> str:
    return os.getenv(
        "SUPERVITY_WORKFLOW_ID",
        "019e26fa-3e44-7000-865a-037b6b9319bc",
    )


def _auth_headers() -> dict[str, str]:
    token = os.getenv("SUPERVITY_API_TOKEN")
    if not token:
        raise HTTPException(
            status_code=500,
            detail="SUPERVITY_API_TOKEN is not configured on the backend.",
        )

    token = token.strip()
    authorization = token if token.lower().startswith("bearer ") else f"Bearer {token}"

    return {
        "Authorization": authorization,
        "x-source": os.getenv("SUPERVITY_SOURCE", "v1"),
    }


def build_supervity_form(payload: CampaignRunRequest) -> dict[str, str]:
    brief = payload.campaign_brief
    test_mode = payload.test_mode or "happy_path"

    return {
        "workflowId": _workflow_id(),
        "inputs[triggered_by]": payload.triggered_by,
        "inputs[campaign_name]": brief.campaign_name,
        "inputs[product_offer]": brief.product_offer,
        "inputs[audience]": brief.audience,
        "inputs[campaign_goal]": brief.campaign_goal,
        "inputs[core_message]": brief.core_message,
        "inputs[key_benefits]": "\n".join(brief.key_benefits),
        "inputs[tone]": brief.tone,
        "inputs[cta_link]": brief.cta_link,
        "inputs[target_channels]": ", ".join(brief.target_channels),
        "inputs[success_metric]": brief.success_metric,
        "inputs[test_mode]": test_mode,
    }


def _walk_values(value: Any):
    if isinstance(value, dict):
        for item in value.values():
            yield from _walk_values(item)
    elif isinstance(value, list):
        for item in value:
            yield from _walk_values(item)
    else:
        yield value


def _find_first(value: Any, keys: set[str]) -> Any:
    if isinstance(value, dict):
        for key, item in value.items():
            if key in keys and item not in (None, ""):
                return item
        for item in value.values():
            found = _find_first(item, keys)
            if found not in (None, ""):
                return found
    elif isinstance(value, list):
        for item in value:
            found = _find_first(item, keys)
            if found not in (None, ""):
                return found
    return None


def _text_blob(value: Any) -> str:
    return " ".join(str(item) for item in _walk_values(value) if item is not None).lower()


def _extract_timeline(raw: Any, raw_events: list[Any] | None = None) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for index, event in enumerate(raw_events or []):
        events.append(
            {
                "id": f"stream-{index}",
                "label": str(_find_first(event, {"name", "event", "stepName", "nodeName"}) or "Stream event"),
                "status": str(_find_first(event, {"status", "state"}) or "received"),
                "raw": event,
            }
        )

    activity_runs = _find_first(raw, {"activityRuns", "activities", "steps", "nodes"})
    if isinstance(activity_runs, list):
        for index, activity in enumerate(activity_runs):
            events.append(
                {
                    "id": str(_find_first(activity, {"id", "activityRunId"}) or f"activity-{index}"),
                    "label": str(_find_first(activity, {"name", "title", "activityName", "nodeName"}) or "Workflow activity"),
                    "status": str(_find_first(activity, {"status", "state"}) or "unknown"),
                    "raw": activity,
                }
            )

    return events


def normalize_run(raw: Any, raw_events: list[Any] | None = None) -> dict[str, Any]:
    status = str(_find_first(raw, {"status", "state", "runStatus"}) or "").lower()
    text = _text_blob({"raw": raw, "events": raw_events or []})

    if status in {"scheduled", "running", "in_progress", "processing"}:
        normalized_status = "running"
    elif status == "waiting":
        if any(term in text for term in ("approval", "approve", "communication approval gate")):
            normalized_status = "approval_pending"
        elif any(term in text for term in ("missing", "validation", "exception", "workbench")):
            normalized_status = "paused_needs_human_input"
        else:
            normalized_status = "paused_needs_human_input"
    elif status == "completed":
        normalized_status = "completed"
    elif status == "cancelled":
        normalized_status = "failed"
    elif status == "failed":
        normalized_status = "failed"
    elif raw_events:
        normalized_status = "running"
    else:
        normalized_status = "idle"

    error_reason = _find_first(raw, {"error", "errorMessage", "failureReason", "message"})
    if status == "cancelled" and not error_reason:
        error_reason = "cancelled"

    return {
        "runId": _find_first(raw, {"runId", "workflowRunId", "id"}),
        "status": normalized_status,
        "sourceStatus": status or None,
        "errorReason": error_reason if normalized_status == "failed" else None,
        "timeline": _extract_timeline(raw, raw_events),
        "outputs": _find_first(raw, {"outputs", "output", "result", "results"}),
        "raw": raw,
        "rawEvents": raw_events or [],
    }


def _parse_stream_line(line: str) -> Any:
    value = line.strip()
    if not value:
        return None
    if value.startswith("data:"):
        value = value[5:].strip()
    if value == "[DONE]":
        return {"event": "done"}
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return {"message": value}


async def _request_json(method: str, path: str, **kwargs) -> Any:
    url = f"{_api_base()}{path}"
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.request(method, url, headers=_auth_headers(), **kwargs)
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    if not response.content:
        return {}
    return response.json()


@router.post("/runs")
async def start_campaign_run(payload: CampaignRunRequest):
    form_fields = build_supervity_form(payload)
    files = {key: (None, value) for key, value in form_fields.items()}
    raw_events: list[Any] = []

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            f"{_api_base()}{_execute_path()}",
            headers=_auth_headers(),
            files=files,
        ) as response:
            if response.status_code >= 400:
                body = await response.aread()
                raise HTTPException(
                    status_code=response.status_code,
                    detail=body.decode("utf-8", errors="replace"),
                )

            async for line in response.aiter_lines():
                parsed = _parse_stream_line(line)
                if parsed is not None:
                    raw_events.append(parsed)

    raw = raw_events[-1] if raw_events else {}
    normalized = normalize_run(raw, raw_events)
    normalized["request"] = {"formFields": dict(form_fields)}
    return normalized


@router.get("/runs/{run_id}")
async def get_campaign_run(run_id: str):
    raw = await _request_json("GET", f"/api/v1/workflow-runs/{run_id}")
    return normalize_run(raw)


@router.get("/reviews")
async def list_reviews(request: Request):
    raw = await _request_json(
        "GET",
        "/api/v1/user-forms",
        params=dict(request.query_params),
    )
    return {"items": raw, "raw": raw}


@router.get("/reviews/{form_id}")
async def get_review(form_id: str):
    raw = await _request_json("GET", f"/api/v1/user-forms/{form_id}")
    return {
        "formId": _find_first(raw, {"formId", "id"}) or form_id,
        "runId": _find_first(raw, {"runId", "workflowRunId"}),
        "html": _find_first(raw, {"html"}),
        "schema": _find_first(raw, {"schema"}),
        "raw": raw,
    }


def normalize_review_submit(data: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(data)
    status = normalized.get("status", normalized.pop("primary_action", None))
    status_aliases = {
        "approved": "approve",
        "approve": "approve",
        "rejected": "reject",
        "reject": "reject",
        "exception": "reject",
    }
    if isinstance(status, str):
        normalized["status"] = status_aliases.get(status.strip().lower(), status.strip().lower())
    elif status is not None:
        normalized["status"] = status
    return normalized


@router.post("/reviews/{form_id}/submit")
async def submit_review(form_id: str, payload: ReviewSubmitRequest):
    data = normalize_review_submit(payload.data)
    raw = await _request_json(
        "POST",
        f"/api/v1/user-forms/{form_id}/submit",
        json=data,
    )
    return {"submitted": True, "raw": raw}

