import pytest
import asyncio
from app.routers import apex_marketing
from app.routers.apex_marketing import (
    CampaignBrief,
    CampaignRunRequest,
    ReviewSubmitRequest,
    build_supervity_form,
    normalize_run,
    submit_review,
)



def _payload(test_mode="happy_path", cta_link="https://example.com/demo", benefits=None):
    return CampaignRunRequest(
        triggered_by="Aarushi",
        test_mode=test_mode,
        campaign_brief=CampaignBrief(
            campaign_name="Apex AI Employee Launch",
            product_offer="Supervity-powered Marketing AI Employee for campaign execution",
            audience="Growth marketing leads",
            campaign_goal="Drive demo signups",
            core_message="Turn campaign briefs into approved execution.",
            key_benefits=benefits
            or [
                "Reduces manual campaign execution time.",
                "Enforces approval gates.",
                "Creates channel-ready assets.",
            ],
            tone="Confident",
            cta_link=cta_link,
            target_channels=["LinkedIn", "X", "Blog", "HubSpot"],
            success_metric="Demo signups",
        ),
    )


def test_build_supervity_form_happy_path(monkeypatch):
    monkeypatch.setenv("SUPERVITY_WORKFLOW_ID", "workflow-123")

    form = build_supervity_form(_payload())

    assert form["workflowId"] == "workflow-123"
    assert form["inputs[triggered_by]"] == "Aarushi"
    assert form["inputs[campaign_name]"] == "Apex AI Employee Launch"
    assert form["inputs[key_benefits]"] == "Reduces manual campaign execution time.\nEnforces approval gates.\nCreates channel-ready assets."
    assert form["inputs[target_channels]"] == "LinkedIn, X, Blog, HubSpot"
    assert form["inputs[test_mode]"] == "happy_demo"
    assert form["inputs[approval_status_override]"] == "approved_for_test"
    assert form["inputs[reviewer_feedback]"] == "Approved for controlled live demo execution."
    assert form["inputs[approval_channel]"] == "teams"
    assert form["inputs[correction_payload]"] == "{}"
    assert "Apex AI Employee Launch" in form["inputs[campaign_brief]"]


def test_build_supervity_form_broken_path_preserves_missing_cta(monkeypatch):
    monkeypatch.setenv("SUPERVITY_WORKFLOW_ID", "workflow-123")

    form = build_supervity_form(
        _payload(
            test_mode="broken_path",
            cta_link="",
            benefits=["Saves campaign execution time.", "Creates content drafts."],
        )
    )

    assert form["inputs[cta_link]"] == ""
    assert form["inputs[key_benefits]"] == "Saves campaign execution time.\nCreates content drafts."
    assert form["inputs[test_mode]"] == "exception_demo"
    assert form["inputs[approval_status_override]"] == "none"
    assert form["inputs[approval_channel]"] == "teams"
    assert form["inputs[correction_payload]"] == "{}"


def test_normalize_waiting_validation_exception():
    raw = {
        "runId": "run-1",
        "status": "waiting",
        "message": "MissingDataException: CTA link missing and fewer than 3 benefits",
    }

    normalized = normalize_run(raw)

    assert normalized["runId"] == "run-1"
    assert normalized["status"] == "paused_needs_human_input"


def test_normalize_waiting_approval():
    raw = {
        "runId": "run-2",
        "status": "waiting",
        "form": {"title": "Communication Approval Gate"},
    }

    normalized = normalize_run(raw)

    assert normalized["status"] == "approval_pending"


def test_normalize_failed_and_cancelled():
    failed = normalize_run({"runId": "run-3", "status": "failed", "errorMessage": "Tool failed"})
    cancelled = normalize_run({"runId": "run-4", "status": "cancelled"})

    assert failed["status"] == "failed"
    assert failed["errorReason"] == "Tool failed"
    assert cancelled["status"] == "failed"
    assert cancelled["errorReason"] == "cancelled"


def test_normalize_preserves_stream_events():
    events = [{"event": "node", "status": "running"}, {"event": "done", "status": "completed"}]

    normalized = normalize_run(events[-1], events)

    assert normalized["rawEvents"] == events
    assert len(normalized["timeline"]) == 2


@pytest.mark.asyncio
async def test_submit_review_forwards_payload(monkeypatch):
    captured = {}

    async def fake_request_json(method, path, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["kwargs"] = kwargs
        return {"ok": True}

    monkeypatch.setattr(apex_marketing, "_request_json", fake_request_json)

    response = await submit_review(
        "form-123",
        ReviewSubmitRequest(data={"primary_action": "approved", "feedback": "Looks good"}),
    )

    assert response == {"submitted": True, "raw": {"ok": True}}
    assert captured["method"] == "POST"
    assert captured["path"] == "/api/v1/user-forms/form-123/approve"
    assert captured["kwargs"]["data"] == {"decision": "approved", "feedback": "Looks good"}


@pytest.mark.asyncio
async def test_submit_review_uses_form_action(monkeypatch):
    captured = {"calls": []}

    async def fake_request_json(method, path, **kwargs):
        captured["calls"].append({"method": method, "path": path, "kwargs": kwargs})
        if method == "GET":
            return {"html": '<form method="POST"><button formaction="/api/v1/user-forms/activity-456/approve">Submit Approval</button></form>' }
        return {"ok": True}

    monkeypatch.setattr(apex_marketing, "_request_json", fake_request_json)

    response = await submit_review(
        "form-123",
        ReviewSubmitRequest(data={"primary_action": "approved", "feedback": "Looks good"}),
    )

    assert response == {"submitted": True, "raw": {"ok": True}}
    assert captured["calls"][0]["method"] == "GET"
    assert captured["calls"][0]["path"] == "/api/v1/user-forms/form-123"
    assert captured["calls"][1]["method"] == "POST"
    assert captured["calls"][1]["path"] == "/api/v1/user-forms/activity-456/approve"
    assert captured["calls"][1]["kwargs"]["data"] == {"decision": "approved", "feedback": "Looks good"}






@pytest.mark.asyncio
async def test_request_json_handles_non_json_success(monkeypatch):
    class FakeResponse:
        status_code = 200
        content = b"OK"
        text = "OK"
        headers = {"content-type": "text/plain"}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def request(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(apex_marketing.httpx, "AsyncClient", FakeClient)
    monkeypatch.setenv("SUPERVITY_API_TOKEN", "token")

    result = await apex_marketing._request_json("POST", "/api/v1/user-forms/form/approve", data={"decision": "approved"})

    assert result == {"status_code": 200, "body": "OK"}


def test_extract_run_id_from_review_html():
    html = '<p>Action required for Run ID: <span>8d3fc6d3-1f45-4a5e-84bc-4947aedf7136</span></p>'

    assert apex_marketing._extract_run_id_from_html(html) == "8d3fc6d3-1f45-4a5e-84bc-4947aedf7136"
def test_normalize_uses_parent_object_when_raw_contains_apex_outputs():
    raw = {
        "run_id": "run-5",
        "status": "success",
        "content_drafts": {"LinkedIn": "hello", "X": "thread", "Blog": "post"},
        "ai_insights": {"manual_time_saved_minutes": 45, "campaign_readiness_score": 98},
    }

    normalized = normalize_run(raw)

    assert normalized["outputs"] == raw
    assert normalized["outputs"]["content_drafts"]["LinkedIn"] == "hello"


def test_normalize_finds_nested_apex_outputs_in_earlier_stream_event():
    events = [
        {
            "event": "final",
            "data": {
                "final_response": {
                    "content_drafts": {"LinkedIn": "hello"},
                    "teams": "not_returned",
                    "sharepoint": "not_returned",
                    "hubspot": "not_returned",
                    "ai_insights": {"manual_time_saved_minutes": 45, "campaign_readiness_score": 98},
                }
            },
        },
        {"event": "done", "status": "completed"},
    ]

    normalized = normalize_run(events[-1], events)

    assert normalized["outputs"]["content_drafts"]["LinkedIn"] == "hello"
    assert normalized["outputs"]["ai_insights"]["campaign_readiness_score"] == 98
def test_normalize_prefers_apex_payload_over_generic_step_outputs():
    raw = {
        "status": "completed",
        "activityRuns": [
            {"outputs": {"displayData": {"html": "step preview"}}},
            {
                "final_response": {
                    "content_drafts": {"LinkedIn": "hello"},
                    "teams": "not_returned",
                    "sharepoint": "not_returned",
                    "hubspot": "not_returned",
                    "ai_insights": {"manual_time_saved_minutes": 45, "campaign_readiness_score": 98},
                }
            },
        ],
    }

    normalized = normalize_run(raw)

    assert normalized["outputs"]["content_drafts"]["LinkedIn"] == "hello"
    assert normalized["outputs"]["teams"] == "not_returned"

