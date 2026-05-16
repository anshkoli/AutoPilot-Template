import pytest

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
    assert form["inputs[test_mode]"] == "happy_path"
    assert "approval_channel" not in form
    assert "inputs[approval_channel]" not in form


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
    assert form["inputs[test_mode]"] == "broken_path"


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
    assert captured["path"] == "/api/v1/user-forms/form-123/submit"
    assert captured["kwargs"]["json"] == {"feedback": "Looks good", "status": "approve"}


