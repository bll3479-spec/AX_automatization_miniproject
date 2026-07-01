from collections import Counter
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from app.classifier import classify_with_fallback
from app.config import BASE_DIR
from app.gmail_client import GmailNotConfigured, apply_labels_batch, ensure_label, fetch_recent_emails
from app.sample_data import DEMO_EMAILS
from app.schemas import (
    CATEGORY_META,
    MAIN_CATEGORY_ORDER,
    MINOR_CATEGORY_ORDER,
    Category,
    CategoryInfo,
    ClassificationResult,
    ClassifiedEmail,
    ClassifyBatchRequest,
    ClassifyRequest,
    EmailMessage,
    OverrideRequest,
)

app = FastAPI(title="자봐")

# email_id -> 사람이 수동으로 정정한 카테고리 (인메모리 보관, 미니프로젝트 범위상 DB 미사용)
_overrides: dict[str, Category] = {}


def _fetch_source_emails(source: str, limit: int | None) -> list[EmailMessage]:
    if source == "demo":
        return DEMO_EMAILS[:limit]
    if source == "gmail":
        try:
            return fetch_recent_emails(max_results=limit)
        except GmailNotConfigured as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    raise HTTPException(status_code=400, detail=f"알 수 없는 source: {source}")


def _classify_all(emails: list[EmailMessage]) -> list[ClassifiedEmail]:
    classified: list[ClassifiedEmail] = []
    for email in emails:
        if email.id in _overrides:
            result = ClassificationResult(
                category=_overrides[email.id], confidence=1.0, matched_rule="manual_override"
            )
        else:
            result = classify_with_fallback(email)
        classified.append(ClassifiedEmail(email=email, result=result))
    return classified


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/categories", response_model=list[CategoryInfo])
def get_categories() -> list[CategoryInfo]:
    ordered = MAIN_CATEGORY_ORDER + MINOR_CATEGORY_ORDER
    return [
        CategoryInfo(
            id=cat,
            label_ko=CATEGORY_META[cat]["label_ko"],
            color=CATEGORY_META[cat]["color"],
            is_main=cat in MAIN_CATEGORY_ORDER,
        )
        for cat in ordered
    ]


@app.get("/api/emails")
def get_emails(source: str = "demo", category: Category | None = None, limit: int | None = 20) -> dict:
    emails = _fetch_source_emails(source, limit)
    classified = _classify_all(emails)
    counts = Counter(c.result.category.value for c in classified)
    if category is not None:
        classified = [c for c in classified if c.result.category == category]
    return {"emails": classified, "counts": counts}


@app.get("/api/emails/raw", response_model=list[EmailMessage])
def get_emails_raw(source: str = "demo", limit: int | None = None) -> list[EmailMessage]:
    return _fetch_source_emails(source, limit)


@app.post("/api/classify/batch")
def classify_batch(req: ClassifyBatchRequest) -> dict:
    classified = _classify_all(req.emails)
    return {"emails": classified}


@app.post("/api/classify")
def classify(req: ClassifyRequest) -> dict:
    emails = _fetch_source_emails(req.source, req.limit)
    classified = _classify_all(emails)

    label_apply_failures = 0
    if req.source == "gmail" and req.apply_labels:
        label_id_by_category: dict[str, str] = {}
        for item in classified:
            cat_value = item.result.category.value
            if cat_value not in label_id_by_category:
                label_id_by_category[cat_value] = ensure_label(cat_value)
        failed_ids = apply_labels_batch(
            [
                (item.email.id, label_id_by_category[item.result.category.value])
                for item in classified
            ]
        )
        label_apply_failures = len(failed_ids)

    counts = Counter(c.result.category.value for c in classified)
    return {"emails": classified, "counts": counts, "label_apply_failures": label_apply_failures}


@app.post("/api/emails/{email_id}/override")
def override_category(email_id: str, req: OverrideRequest) -> dict:
    _overrides[email_id] = req.category
    return {"id": email_id, "category": req.category}


FRONTEND_DIR = Path(BASE_DIR).parent / "frontend"
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
