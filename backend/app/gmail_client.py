"""실제 Gmail 계정과 통신하는 클라이언트.

최초 1회 `python scripts/gmail_auth.py` 를 실행해 token.json을 만들어야 동작한다.
token.json이 없으면 GmailNotConfigured를 던지며, 데모 모드는 이 모듈을 전혀 사용하지 않는다.
"""

from __future__ import annotations

import time

from app.config import settings
from app.schemas import EmailMessage

SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]

_LABEL_PREFIX = "AX"


class GmailNotConfigured(Exception):
    pass


def _load_credentials():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    token_file = settings.gmail_token_file()
    if not token_file.exists():
        raise GmailNotConfigured(
            f"{token_file} 가 없습니다. backend 디렉터리에서 "
            "`python scripts/gmail_auth.py` 를 먼저 실행해 Gmail 인증을 완료하세요."
        )

    creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_file.write_text(creds.to_json())
    return creds


def _get_service():
    from googleapiclient.discovery import build

    creds = _load_credentials()
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _header(headers: list[dict], name: str) -> str:
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def _parse_message(raw: dict) -> EmailMessage:
    payload = raw.get("payload", {})
    headers = payload.get("headers", [])
    return EmailMessage(
        id=raw["id"],
        thread_id=raw.get("threadId", raw["id"]),
        sender=_header(headers, "From"),
        subject=_header(headers, "Subject"),
        snippet=raw.get("snippet", ""),
        date=_header(headers, "Date"),
        has_list_unsubscribe=bool(_header(headers, "List-Unsubscribe")),
    )


def fetch_recent_emails(max_results: int = 20) -> list[EmailMessage]:
    service = _get_service()
    response = (
        service.users()
        .messages()
        .list(userId="me", maxResults=max_results, labelIds=["INBOX"])
        .execute()
    )
    message_stubs = response.get("messages", [])

    emails: list[EmailMessage] = []
    for stub in message_stubs:
        raw = (
            service.users()
            .messages()
            .get(userId="me", id=stub["id"], format="metadata",
                 metadataHeaders=["From", "Subject", "Date", "List-Unsubscribe"])
            .execute()
        )
        emails.append(_parse_message(raw))
    return emails


def _sanitize_label_name(category_value: str) -> str:
    return f"{_LABEL_PREFIX}/{category_value}"


def ensure_label(category_value: str) -> str:
    """카테고리에 대응하는 Gmail 라벨이 없으면 만들고 라벨 ID를 반환한다."""
    service = _get_service()
    label_name = _sanitize_label_name(category_value)

    existing = service.users().labels().list(userId="me").execute().get("labels", [])
    for label in existing:
        if label["name"] == label_name:
            return label["id"]

    created = (
        service.users()
        .labels()
        .create(
            userId="me",
            body={
                "name": label_name,
                "labelListVisibility": "labelShow",
                "messageListVisibility": "show",
            },
        )
        .execute()
    )
    label_id = created["id"]
    _wait_until_label_usable(service, label_id)
    return label_id


def _wait_until_label_usable(service, label_id: str, attempts: int = 5, delay: float = 0.5) -> None:
    """방금 생성한 라벨은 Gmail 쪽에 전파되기까지 잠시 지연이 있어,
    곧바로 메일에 적용하면 'labelId not found'가 날 수 있다. 라벨이 실제로
    조회될 때까지 짧게 재시도해 이 지연을 흡수한다."""
    from googleapiclient.errors import HttpError

    for _ in range(attempts):
        try:
            service.users().labels().get(userId="me", id=label_id).execute()
            return
        except HttpError:
            time.sleep(delay)


def apply_label(message_id: str, label_id: str) -> None:
    from googleapiclient.errors import HttpError

    service = _get_service()
    attempts = 3
    for attempt in range(attempts):
        try:
            service.users().messages().modify(
                userId="me", id=message_id, body={"addLabelIds": [label_id]}
            ).execute()
            return
        except HttpError as exc:
            if attempt < attempts - 1 and exc.resp.status == 400:
                time.sleep(0.5)
                continue
            raise
