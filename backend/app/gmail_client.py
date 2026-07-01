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


# Gmail API 한 번 호출(list)당 최대 허용치. 이를 넘으면 nextPageToken으로 페이지를 더 가져온다.
_LIST_PAGE_SIZE = 500

# max_results=None("전체")일 때 무한정 호출을 막기 위한 안전 상한.
_ALL_MAIL_SAFETY_CAP = 2000

# Gmail API가 batch 요청 1건당 허용하는 최대 하위 요청 수.
_BATCH_SIZE = 100


def fetch_recent_emails(max_results: int | None = 20) -> list[EmailMessage]:
    """max_results=None 이면 받은편지함 전체(안전 상한까지)를 페이지네이션으로 가져온다.
    max_results가 지정되더라도 실제 메일 수가 그보다 적으면 있는 만큼 전부 반환한다."""
    service = _get_service()
    cap = _ALL_MAIL_SAFETY_CAP if max_results is None else max_results

    message_stubs: list[dict] = []
    page_token: str | None = None
    while len(message_stubs) < cap:
        # 항상 최대 페이지 크기를 요청해 Gmail이 페이지당 결과를 최대로 반환하도록 한다.
        response = (
            service.users()
            .messages()
            .list(
                userId="me",
                maxResults=_LIST_PAGE_SIZE,
                labelIds=["INBOX"],
                pageToken=page_token,
            )
            .execute()
        )
        stubs = response.get("messages", [])
        message_stubs.extend(stubs)
        page_token = response.get("nextPageToken")
        if not page_token or not stubs:
            break

    return _fetch_messages_batch(service, [stub["id"] for stub in message_stubs[:cap]])


def _fetch_messages_batch(service, message_ids: list[str]) -> list[EmailMessage]:
    """메일 ID별로 .get()을 순차 호출하는 대신, batch 요청으로 묶어 호출 수를 줄인다."""
    raw_by_id: dict[str, dict] = {}

    def _callback(request_id, response, exception):
        if exception is None:
            raw_by_id[request_id] = response

    for chunk_start in range(0, len(message_ids), _BATCH_SIZE):
        chunk = message_ids[chunk_start : chunk_start + _BATCH_SIZE]
        batch = service.new_batch_http_request(callback=_callback)
        for message_id in chunk:
            batch.add(
                service.users().messages().get(
                    userId="me",
                    id=message_id,
                    format="metadata",
                    metadataHeaders=["From", "Subject", "Date", "List-Unsubscribe"],
                ),
                request_id=message_id,
            )
        batch.execute()

    return [_parse_message(raw_by_id[mid]) for mid in message_ids if mid in raw_by_id]


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


def apply_labels_batch(message_label_pairs: list[tuple[str, str]]) -> list[str]:
    """(메일 ID, 라벨 ID) 쌍들을 batch 요청으로 한 번에 적용한다.

    막 생성된 라벨의 전파 지연, 또는 대량 요청 시 Gmail 쪽 사용자별 순간 요청 수
    제한(버스트 레이트리밋)으로 일부가 실패할 수 있어, 실패한 것만 모아
    지수 백오프(0.5s → 1s → 2s → 4s → 4s)로 재시도한다.

    재시도를 모두 거치고도 실패하는 메일이 있을 수 있다 — 이미 성공한
    나머지 메일의 라벨은 그대로 적용된 상태이므로, 예외를 던져 전체 응답을
    실패시키는 대신 끝까지 실패한 메일 ID 목록을 반환해 호출자가 부분 실패를
    알 수 있게 한다."""
    service = _get_service()
    pending = list(message_label_pairs)
    delay = 0.5

    for _ in range(5):
        if not pending:
            return []
        failed: list[tuple[str, str]] = []
        pending_by_request_id = {str(i): pair for i, pair in enumerate(pending)}

        def _callback(request_id, response, exception):
            if exception is not None:
                failed.append(pending_by_request_id[request_id])

        for chunk_start in range(0, len(pending), _BATCH_SIZE):
            chunk = pending[chunk_start : chunk_start + _BATCH_SIZE]
            batch = service.new_batch_http_request(callback=_callback)
            for offset, (message_id, label_id) in enumerate(chunk):
                batch.add(
                    service.users().messages().modify(
                        userId="me", id=message_id, body={"addLabelIds": [label_id]}
                    ),
                    request_id=str(chunk_start + offset),
                )
            batch.execute()

        if not failed:
            return []
        pending = failed
        time.sleep(delay)
        delay = min(delay * 2, 4.0)

    return [message_id for message_id, _ in pending]
