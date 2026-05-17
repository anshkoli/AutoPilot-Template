# app/routers/apex_marketing.py
"""
Apex Marketing AI Employee proxy endpoints.

The real AI Employee runs in Supervity Auto. This router keeps the browser
away from Supervity credentials and normalizes run/review responses for the
Command Center UI without re-implementing agent logic locally.
"""

import asyncio
import json
import os
import re
from html.parser import HTMLParser
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
    approval_channel: str = "teams"
    approval_status_override: str | None = None
    reviewer_feedback: str | None = None
    approval_bypass_reason: str | None = None
    correction_payload: dict[str, Any] = Field(default_factory=dict)


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


def _normalize_tenant_value(value: str) -> str:
    normalized = value.strip()
    aliases = {
        "codex": "Codex",
        "team codex": "Team Codex",
    }
    return aliases.get(normalized.lower(), normalized)


def _tenant_value(request: Request | None, header_name: str, env_name: str, default: str) -> str:
    if request is not None:
        value = request.headers.get(header_name)
        if value:
            return _normalize_tenant_value(value)
    value = os.getenv(env_name) or os.getenv(f"NEXT_PUBLIC_{env_name}") or default
    return _normalize_tenant_value(value)


def _auth_headers(request: Request | None = None) -> dict[str, str]:
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
        "x-active-org": _tenant_value(request, "x-active-org", "ACTIVE_ORG", "codex"),
        "x-active-team": _tenant_value(request, "x-active-team", "ACTIVE_TEAM", "team codex"),
    }


def _brief_dict(brief: CampaignBrief) -> dict[str, Any]:
    if hasattr(brief, "model_dump"):
        return brief.model_dump()
    return brief.dict()


def _supervity_test_mode(test_mode: str) -> str:
    mapping = {
        "happy_path": "happy_demo",
        "broken_path": "exception_demo",
    }
    return mapping.get(test_mode or "happy_path", test_mode or "happy_demo")


def build_supervity_form(payload: CampaignRunRequest) -> dict[str, str]:
    brief = payload.campaign_brief
    test_mode = _supervity_test_mode(payload.test_mode)

    if test_mode == "happy_demo":
        approval_status_override = "approved_for_test"
        reviewer_feedback = "Approved for controlled live demo execution."
        approval_bypass_reason = (
            "Manual approval form is bypassed for demo because the Supervity approval form "
            "returned workflow execution already completed during testing."
        )
    elif test_mode == "exception_demo":
        approval_status_override = "none"
        reviewer_feedback = payload.reviewer_feedback or ""
        approval_bypass_reason = payload.approval_bypass_reason or ""
    else:
        approval_status_override = payload.approval_status_override or "none"
        reviewer_feedback = payload.reviewer_feedback or ""
        approval_bypass_reason = payload.approval_bypass_reason or ""

    return {
        "workflowId": _workflow_id(),
        "inputs[triggered_by]": payload.triggered_by,
        "inputs[campaign_brief]": json.dumps(_brief_dict(brief)),
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
        "inputs[approval_status_override]": approval_status_override,
        "inputs[reviewer_feedback]": reviewer_feedback,
        "inputs[approval_bypass_reason]": approval_bypass_reason,
        "inputs[approval_channel]": payload.approval_channel or "teams",
        "inputs[correction_payload]": json.dumps(payload.correction_payload or {}),
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


def _find_parent_with_any_keys(value: Any, keys: set[str]) -> Any:
    if isinstance(value, dict):
        if any(key in value and value[key] not in (None, "") for key in keys):
            return value
        for item in value.values():
            found = _find_parent_with_any_keys(item, keys)
            if found is not None:
                return found
    elif isinstance(value, list):
        for item in value:
            found = _find_parent_with_any_keys(item, keys)
            if found is not None:
                return found
    return None


def _text_blob(value: Any) -> str:
    return " ".join(str(item) for item in _walk_values(value) if item is not None).lower()

def _extract_run_id_from_html(html: str | None) -> str | None:
    if not html:
        return None
    match = re.search(
        r"Run\s*ID\s*:\s*(?:<[^>]+>\s*)?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})",
        html,
        re.IGNORECASE,
    )
    if match:
        return match.group(1)

    # Fallback for forms that include only a UUID-looking workflow run id.
    match = re.search(
        r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
        html,
    )
    return match.group(0) if match else None



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
    elif status in {"completed", "success", "succeeded"}:
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

    wrapper_keys = {"outputs", "output", "result", "results", "final_response", "finalApiResponse"}
    apex_output_keys = {
        "content_drafts",
        "teams",
        "sharepoint",
        "hubspot",
        "ai_insights",
        "workbench_exception",
        "processed_request_payload",
        "agent_timeline",
    }

    # Prefer a real Apex-shaped payload over incidental per-step `outputs`
    # records that appear earlier in workflow activity history.
    output_value = _find_parent_with_any_keys(raw, apex_output_keys)
    if output_value is None and raw_events:
        output_value = _find_parent_with_any_keys(raw_events, apex_output_keys)

    if output_value is None:
        output_value = _find_first(raw, wrapper_keys)
    if output_value is None and raw_events:
        output_value = _find_first(raw_events, wrapper_keys)

    return {
        "runId": _find_first(raw, {"runId", "workflowRunId", "id"}),
        "status": normalized_status,
        "sourceStatus": status or None,
        "errorReason": error_reason if normalized_status == "failed" else None,
        "timeline": _extract_timeline(raw, raw_events),
        "outputs": output_value,
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


async def _request_json(method: str, path: str, request: Request | None = None, **kwargs) -> Any:
    if path.startswith("http://") or path.startswith("https://"):
        url = path
    else:
        url = f"{_api_base()}{path}"
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.request(method, url, headers=_auth_headers(request), **kwargs)
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    if not response.content:
        return {"status_code": response.status_code, "body": None}

    content_type = response.headers.get("content-type", "").lower()
    if "application/json" in content_type:
        return response.json()

    text = response.text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"status_code": response.status_code, "body": text}


@router.post("/runs")
async def start_campaign_run(payload: CampaignRunRequest, request: Request):
    form_fields = build_supervity_form(payload)
    files = {key: (None, value) for key, value in form_fields.items()}
    raw_events: list[Any] = []
    stream_timed_out = False

    timeout = httpx.Timeout(connect=20, read=15, write=20, pool=20)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            f"{_api_base()}{_execute_path()}",
            headers=_auth_headers(request),
            files=files,
        ) as response:
            if response.status_code >= 400:
                body = await response.aread()
                raise HTTPException(
                    status_code=response.status_code,
                    detail=body.decode("utf-8", errors="replace"),
                )

            try:
                max_seconds = float(os.getenv("SUPERVITY_STREAM_MAX_SECONDS", "45"))
                async with asyncio.timeout(max_seconds):
                    async for line in response.aiter_lines():
                        parsed = _parse_stream_line(line)
                        if parsed is not None:
                            raw_events.append(parsed)
            except (TimeoutError, httpx.ReadTimeout):
                stream_timed_out = True

    if not raw_events:
        return {
            "runId": None,
            "status": "running",
            "sourceStatus": "stream_timeout" if stream_timed_out else "stream_open",
            "errorReason": None,
            "timeline": [],
            "outputs": None,
            "raw": {
                "message": "Supervity stream did not return an event before the local timeout.",
                "streamTimedOut": stream_timed_out,
            },
            "rawEvents": [],
            "request": {"formFields": dict(form_fields)},
        }

    raw = raw_events[-1]
    normalized = normalize_run(raw, raw_events)
    normalized["request"] = {"formFields": dict(form_fields)}
    if stream_timed_out and normalized["status"] == "running":
        normalized["sourceStatus"] = "stream_timeout"
    return normalized


@router.get("/runs/{run_id}")
async def get_campaign_run(run_id: str, request: Request):
    raw = await _request_json("GET", f"/api/v1/workflow-runs/{run_id}", request=request)
    return normalize_run(raw)


@router.get("/reviews")
async def list_reviews(request: Request):
    raw = await _request_json(
        "GET",
        "/api/v1/user-forms",
        request=request,
        params=dict(request.query_params),
    )
    return {"items": raw, "raw": raw}


@router.get("/reviews/{form_id}")
async def get_review(form_id: str, request: Request):
    raw = await _request_json("GET", f"/api/v1/user-forms/{form_id}", request=request)
    html = _find_first(raw, {"html"})
    return {
        "formId": _find_first(raw, {"formId", "id"}) or form_id,
        "runId": _find_first(raw, {"runId", "workflowRunId"}) or _extract_run_id_from_html(html if isinstance(html, str) else None),
        "html": html,
        "schema": _find_first(raw, {"schema"}),
        "raw": raw,
    }


class _FormActionParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.action: str | None = None
        self.actions_by_value: dict[str, str] = {}
        self._current_button_action: str | None = None
        self._current_button_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {name.lower(): value for name, value in attrs if name}
        lowered_tag = tag.lower()
        if lowered_tag == "form" and self.action is None and attr_map.get("action"):
            self.action = attr_map["action"].strip()
            return

        form_action = attr_map.get("formaction")
        if form_action:
            action = form_action.strip()
            for key in ("value", "name", "id", "aria-label", "title"):
                value = attr_map.get(key)
                if value:
                    self.actions_by_value[value.strip().lower()] = action
            if lowered_tag == "button":
                self._current_button_action = action
                self._current_button_text = []

    def handle_data(self, data: str) -> None:
        if self._current_button_action:
            self._current_button_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "button" or not self._current_button_action:
            return
        text = " ".join(part.strip() for part in self._current_button_text if part.strip()).strip().lower()
        if text:
            self.actions_by_value[text] = self._current_button_action
        self._current_button_action = None
        self._current_button_text = []


def _extract_form_action(html: str, status: str | None = None) -> str | None:
    parser = _FormActionParser()
    parser.feed(html or "")
    parser.close()

    if status:
        status = status.strip().lower()
        candidates = {
            "approve": ("approve", "approved", "submit approval", "submit decision"),
            "reject": ("reject", "rejected", "reject request", "cancel / reject", "request changes"),
        }.get(status, (status,))
        for candidate in candidates:
            action = parser.actions_by_value.get(candidate)
            if action:
                return action
        for label, action in parser.actions_by_value.items():
            lowered_action = action.lower()
            if status in lowered_action or status in label:
                return action

    return parser.action

def _extract_review_actions(html: str) -> str | None:
    return _extract_form_action(html)


def _resolve_review_submit_path(form_id: str, html: str | None, status: str | None) -> str:
    if html:
        extracted = _extract_form_action(html, status)
        if extracted:
            return extracted

    if status in {"approve", "reject"}:
        return f"/api/v1/user-forms/{form_id}/{status}"

    return f"/api/v1/user-forms/{form_id}/submit"


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


async def _submit_review_impl(form_id: str, request: Request | ReviewSubmitRequest):
    """
    Accept JSON or form submissions. If the incoming request cannot be parsed
    as JSON or form data (for example, malformed multipart headers), proxy
    the raw body and headers through to the resolved submit path instead of
    raising a 500 from FastAPI form parsing internals.
    """

    # Support direct unit-test calls which pass a ReviewSubmitRequest instance
    review = None
    inbound_request = request if isinstance(request, Request) else None
    if isinstance(request, ReviewSubmitRequest):
        payload = request
        data = normalize_review_submit(payload.data)
        review = await _request_json("GET", f"/api/v1/user-forms/{form_id}", request=inbound_request)
    else:
        # Try to parse JSON body first
        data: dict[str, Any] | None = None
        raw_body: bytes | None = None
        content_type = (request.headers.get("content-type") or "").lower()

        if "application/json" in content_type or request.headers.get("content-type") is None:
            try:
                payload_json = await request.json()
                # accept either { data: {...} } or raw dict
                if isinstance(payload_json, dict) and "data" in payload_json:
                    data = payload_json.get("data")
                elif isinstance(payload_json, dict):
                    data = payload_json
            except Exception:
                # fallthrough to try form or raw body
                data = None

        if data is None and ("multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type):
            try:
                form = await request.form()
                form_dict = {k: v for k, v in form.items()}
                maybe = form_dict.get("data") or form_dict
                if isinstance(maybe, str):
                    try:
                        data = json.loads(maybe)
                    except Exception:
                        data = maybe
                else:
                    data = maybe
            except Exception:
                # Could not parse form (often due to missing boundary); read raw body
                raw_body = await request.body()

        # If still no structured data but we have a raw body, we'll proxy raw
        if data is None and raw_body is None:
            # final attempt: read raw body
            try:
                raw_body = await request.body()
                # attempt to decode JSON from raw
                try:
                    payload_json = json.loads(raw_body.decode("utf-8"))
                    if isinstance(payload_json, dict) and "data" in payload_json:
                        data = payload_json.get("data")
                    elif isinstance(payload_json, dict):
                        data = payload_json
                except Exception:
                    data = None
            except Exception:
                data = None
    # If we couldn't parse structured data but have raw_body, proxy the raw request
    if data is None and raw_body is not None:
        # Resolve submit path using review HTML/status as best-effort
        review = await _request_json("GET", f"/api/v1/user-forms/{form_id}", request=inbound_request)
        form_html = _find_first(review, {"html"})
        # Try to resolve status from query params or leave None
        status = None
        submit_path = _resolve_review_submit_path(
            form_id,
            form_html if isinstance(form_html, str) else None,
            status,
        )

        # Proxy the raw request body and original content-type to the remote submit path
        url = submit_path if submit_path.startswith("http") else f"{_api_base()}{submit_path}"
        headers = _auth_headers(request)
        # preserve original content-type if present
        if request.headers.get("content-type"):
            headers["Content-Type"] = request.headers.get("content-type")

        async with httpx.AsyncClient(timeout=60) as client:
            proxied = await client.request("POST", url, headers=headers, content=raw_body)
            if proxied.status_code >= 400:
                raise HTTPException(status_code=proxied.status_code, detail=proxied.text)
            try:
                raw = proxied.json()
            except Exception:
                raw = {"status_code": proxied.status_code, "text": proxied.text}

        return {"submitted": True, "raw": raw}

    # Otherwise we parsed structured data and continue
    data = normalize_review_submit(data or {})
    if review is None:
        review = await _request_json("GET", f"/api/v1/user-forms/{form_id}", request=inbound_request)
    form_html = _find_first(review, {"html"})
    status = data.get("status")
    submit_path = _resolve_review_submit_path(
        form_id,
        form_html if isinstance(form_html, str) else None,
        status if isinstance(status, str) else None,
    )

    if isinstance(status, str) and status in {"approve", "reject"}:
        form_fields = {
            "decision": "approved" if status == "approve" else "rejected",
            "feedback": str(data.get("feedback") or ""),
        }
        exception_type = data.get("exception_type")
        if exception_type and str(exception_type).upper() != "N/A":
            form_fields["exception_type"] = str(exception_type)

        raw = await _request_json(
            "POST",
            submit_path,
            request=inbound_request,
            data=form_fields,
        )
    else:
        raw = await _request_json(
            "POST",
            submit_path,
            request=inbound_request,
            json=data,
        )

    return {"submitted": True, "raw": raw}


@router.post("/reviews/{form_id}/submit")
async def submit_review_route(form_id: str, request: Request):
    return await _submit_review_impl(form_id, request)


# Export a callable named `submit_review` for unit tests and direct imports
submit_review = _submit_review_impl
















