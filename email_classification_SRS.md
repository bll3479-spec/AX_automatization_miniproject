# SRS (Software Requirements Specification) — 자봐 (이메일 자동 카테고리 분류 앱)

| 항목 | 내용 |
|---|---|
| 문서명 | 자봐 SRS |
| 버전 | 1.0 |
| 대상 시스템 | `backend/`(FastAPI) + `frontend/`(정적 HTML/CSS/JS) |
| 관련 문서 | `기획서.md`, `README.md` |

---

## 1. 서론 (Introduction)

### 1.1 목적 (Purpose)
이 문서는 이메일을 자동으로 분류·태깅하는 로컬 웹앱 "자봐"의 기능·비기능 요구사항을 정의한다. 개발자가 구현 범위를 명확히 하고, 이후 변경 시 영향 범위를 추적할 수 있도록 요구사항에 ID를 부여한다.

### 1.2 범위 (Scope)
- 데모 샘플 데이터 또는 사용자 본인의 Gmail 계정에서 이메일을 가져와 6개 카테고리(보안/영수증/업무/프로모션/오늘의 소식/기타)로 분류한다.
- 분류는 규칙(키워드/발신자/헤더) 기반이며, 규칙에 매칭되지 않는 메일만 선택적으로 Claude API 보조 분류를 사용한다.
- 분류 결과를 대시보드에서 확인하고, 사용자가 수동으로 정정할 수 있다.
- Gmail 연동 시 분류 결과에 따라 실제 Gmail 라벨을 생성·적용할 수 있다.
- **범위 밖**: 다중 사용자/로그인, 영속 DB, 모바일 앱, 실시간 동기화, 분류 규칙 자체의 카테고리 확장(예: "오늘의 소식"을 일반 공지까지 포함하도록 넓히는 것).

### 1.3 정의 및 약어 (Definitions, Acronyms, Abbreviations)

| 용어 | 설명 |
|---|---|
| FR | Functional Requirement, 기능 요구사항 |
| NFR | Non-functional Requirement, 비기능 요구사항 |
| 카테고리 내부 id | `Category` enum 값(`security`, `payment`, `work`, `promotion`, `newsletter`, `other`). 화면 표시명(`label_ko`)과 분리되어 있음 |
| `matched_rule` | 분류 근거가 된 키워드/발신자 패턴 문자열, 또는 `manual_override`/`llm` |
| LLM 보조 분류 | 규칙에 전혀 매칭되지 않은(`OTHER`) 메일만 대상으로 하는 Claude API 기반 분류 |
| 메인 카테고리 | 첫 화면에서 큰 섹션으로 강조 표시되는 카테고리(오늘의 소식/업무/영수증) |
| 기타(minor) 카테고리 | 첫 화면 하단에 작은 요약으로 표시되는 카테고리(보안/프로모션/기타) |

### 1.4 참조 문서 (References)
- `README.md` — 실행 방법, Gmail 연동 절차
- `기획서.md` — 제품 기획 의도, 화면 설계, 보안 검토 결과(14장)
- `backend/app/classifier.py`, `schemas.py`, `main.py`, `gmail_client.py`, `config.py`
- `backend/tests/test_classifier.py`

---

## 2. 전체 설명 (Overall Description)

### 2.1 제품 관점 (Product Perspective)
독립 실행형(standalone) 로컬 웹앱이다. 외부 시스템과의 관계는 두 가지로 한정된다:
- **Gmail API** (선택) — 사용자 본인의 OAuth 자격증명으로 받은편지함 메타데이터 조회 및 라벨 생성/적용.
- **Anthropic API** (선택) — 규칙에 매칭되지 않는 메일만 보조 분류 요청. API 키가 없으면 전혀 호출되지 않음.

```
[브라우저]
   │  HTTP (JSON / 정적 파일)
   ▼
[FastAPI 단일 프로세스 :8000]
   ├─ StaticFiles  →  frontend/ (index.html, app.js, styles.css)
   └─ REST API     →  app/main.py
                         ├─ app/classifier.py  (규칙 분류 + LLM 보조 분류) ── Anthropic API (선택)
                         ├─ app/gmail_client.py (Gmail 조회/라벨)         ── Gmail API (선택)
                         └─ app/sample_data.py  (데모 데이터, 외부 의존 없음)
```

### 2.2 제품 기능 요약 (Product Functions)
1. 이메일 소스 선택(데모/Gmail) 및 조회
2. 규칙 기반 1차 분류 (보안 메일은 LLM 경로에서 절대 제외)
3. 규칙 미매칭 메일의 선택적 LLM 보조 분류
4. 분류 결과 대시보드 표시 (메인 3카테고리 강조 + 기타 요약)
5. 카테고리별 필터링 (탭)
6. 분류 결과 수동 정정
7. Gmail 라벨 생성 및 적용 (선택)

### 2.3 사용자 특성 (User Characteristics)
- 단일 사용자, 비전문가도 사용 가능한 수준의 UI (별도 교육 불필요).
- 로컬에서 직접 `uvicorn`을 실행할 수 있는 최소한의 기술 이해도(터미널 사용)를 가정.
- Gmail 연동을 사용하려면 Google Cloud Console에서 OAuth 클라이언트를 직접 발급할 수 있어야 함.

### 2.4 제약 조건 (Constraints)
- 빌드 도구 없는 정적 프론트엔드(바닐라 JS)만 사용 — 프레임워크/번들러 도입 금지.
- 백엔드와 프론트엔드는 하나의 포트(`uvicorn`)에서 동시에 서빙되어야 함.
- 분류 결과·수동 정정은 DB 없이 인메모리로만 보관 (서버 재시작 시 초기화됨).
- 보안 카테고리로 분류된 메일의 본문/제목/스니펫은 어떤 경우에도 외부 LLM API로 전송되지 않아야 함 (최우선 제약).
- Python 3.11, FastAPI 0.115.x, Pydantic v2 기준.

### 2.5 가정 및 의존성 (Assumptions and Dependencies)
- 데모 모드는 외부 API 키/Gmail 인증 없이 항상 동작한다고 가정.
- `ANTHROPIC_API_KEY`가 없으면 LLM 보조 분류 기능은 비활성화되고 규칙 결과(`OTHER`)만 사용된다고 가정.
- Gmail 연동 시 사용자가 `backend/credentials.json`을 직접 준비했다고 가정 (앱이 발급을 대신하지 않음).
- 외부 라이브러리(`google-api-python-client`, `anthropic` 등)의 API 계약이 `requirements.txt`에 고정된 버전과 호환된다고 가정.

---

## 3. 기능 요구사항 (Functional Requirements)

| ID | 요구사항 | 상세 |
|---|---|---|
| FR-01 | 카테고리 메타데이터 제공 | 시스템은 `GET /api/categories`로 6개 카테고리의 `id`, `label_ko`, `color`, `is_main`을 `MAIN_CATEGORY_ORDER`(오늘의 소식→업무→영수증) + `MINOR_CATEGORY_ORDER`(보안→프로모션→기타) 순서로 반환해야 한다. |
| FR-02 | 이메일 소스 조회 | 시스템은 `source` 파라미터(`demo`\|`gmail`)에 따라 데모 샘플(`sample_data.DEMO_EMAILS`) 또는 실제 Gmail 받은편지함(`gmail_client.fetch_recent_emails`)에서 최대 `limit`건의 메일을 조회해야 한다. |
| FR-03 | 규칙 기반 1차 분류 | 시스템은 제목/스니펫 키워드, 발신자 패턴, `List-Unsubscribe` 헤더를 점수화해 `SECURITY → PAYMENT → WORK → PROMOTION → NEWSLETTER → OTHER` 우선순위로 카테고리를 결정해야 한다. |
| FR-04 | 보안 메일 LLM 차단 | `SECURITY`로 분류된 메일은 분류 함수 내부에서 즉시 확정되어야 하며, 어떤 경우에도 LLM(Claude API) 호출 경로에 도달해서는 안 된다. |
| FR-05 | LLM 보조 분류 (선택) | `OTHER`(`no_rule_matched`)로 분류된 메일에 한해, `USE_LLM_FALLBACK=true`이고 `ANTHROPIC_API_KEY`가 설정된 경우만 Claude API로 보조 분류를 시도해야 한다. 조건 미충족 시 규칙 결과(`OTHER`)를 그대로 사용해야 한다. |
| FR-06 | 분류 근거 표시 | 모든 분류 결과는 `category`, `confidence`, `matched_rule`을 포함해야 하며, 화면에 "근거: 키워드 (N%)" 형태로 노출해야 한다. |
| FR-07 | 분류 통계 요약 | 시스템은 전체 건수 및 카테고리별 건수를 집계해 화면 상단에 색상 칩으로 표시해야 한다. |
| FR-08 | 홈 화면 메인 카테고리 강조 | "전체" 탭이 선택된 기본 화면에서는 `is_main=true`인 3개 카테고리를 큰 카드형 섹션으로, 나머지 3개는 하단에 작은 요약 리스트("기타 알림")로 표시해야 한다. |
| FR-09 | 카테고리 필터 탭 | 사용자가 특정 카테고리 탭을 선택하면 해당 카테고리에 속한 메일만 평면 리스트로 표시해야 한다. |
| FR-10 | 수동 카테고리 정정 | 사용자가 메일 카드의 드롭다운에서 카테고리를 변경하면 `POST /api/emails/{id}/override`로 저장되고, 이후 재분류 시 `manual_override`로 고정되어야 한다. |
| FR-11 | Gmail 라벨 적용 (선택) | `source=gmail`이고 `apply_labels=true`인 경우, 카테고리별로 `AX/{내부id}` 라벨을 생성(`ensure_label`)하고 해당 메일에 적용(`apply_label`)해야 한다. |
| FR-12 | Gmail 최초 인증 | 시스템은 `backend/credentials.json`이 있을 때 `scripts/gmail_auth.py` 실행을 통해 1회 OAuth 동의를 수행하고 `token.json`을 생성해야 한다. 토큰이 없는 상태에서 `source=gmail` 요청 시 `GmailNotConfigured` 에러를 명확한 안내 메시지와 함께 반환해야 한다. |
| FR-13 | 헬스 체크 | 시스템은 `GET /api/health`로 `{"status": "ok"}`를 반환해야 한다. |

---

## 4. 비기능 요구사항 (Non-functional Requirements)

### 4.1 성능 (Performance)
- NFR-01: 데모 모드 기준 12건 분류 요청은 1초 이내에 완료되어야 한다(규칙 기반 분류는 외부 호출이 없으므로 보장 가능).
- NFR-02: LLM 보조 분류는 메일당 1회의 Anthropic API 호출(`max_tokens=16`)로 제한해 응답 지연과 비용을 최소화해야 한다.

### 4.2 보안 (Security)
- NFR-03: `SECURITY` 카테고리로 분류된 메일의 본문/제목/스니펫은 외부 LLM API로 전송되어서는 안 된다 (FR-04와 동일 제약의 비기능적 표현, 최우선순위).
  - **알려진 갭**: 현재 이 차단은 `classifier.py`에 하드코딩되어 있고, `config.py`의 `security_llm_block` 설정값은 실제로 읽히지 않는 죽은 설정이다(`기획서.md` 14.1절). 하드코딩 자체는 안전하지만 스펙(설정으로 끌 수 있어야 함)과 불일치하므로 보완 대상이다.
- NFR-04: `credentials.json`, `token.json`, `.env`는 버전 관리에 포함되어서는 안 된다 (`.gitignore`로 보장).
- NFR-05: Gmail OAuth 스코프는 기능에 필요한 최소 권한이어야 한다. (현재 `gmail.modify` 사용 중 — 필요한 건 읽기+라벨뿐이므로 `gmail.readonly`+`gmail.labels`로 축소 검토 필요. `기획서.md` 14.2절 참조)
- NFR-06: LLM에 전달되는 이메일 콘텐츠는 프롬프트 인젝션 시도에 대한 내구성을 갖도록 명확히 구분된 형태로 전달되어야 한다 (현재 미적용, 보완 대상).

### 4.3 가용성 (Availability)
- NFR-07: 데모 모드는 외부 API 키나 네트워크 의존성 없이 항상 동작해야 한다.
- NFR-08: 단일 프로세스/단일 사용자 가정이므로 고가용성(이중화, 장애조치) 요구사항은 없다.

### 4.4 확장성 (Scalability / Extensibility)
- NFR-09: 새 카테고리를 추가할 때 `Category` enum, `CATEGORY_META`, 분류 규칙 테이블만 수정하면 되도록 카테고리 내부 id와 화면 표시 라벨이 분리되어 있어야 한다.
- NFR-10: 메인/기타 카테고리 구성은 백엔드의 `MAIN_CATEGORY_ORDER`/`MINOR_CATEGORY_ORDER` 상수 한 곳에서만 정의되어야 하며, 프론트엔드는 이를 중복 정의하지 않고 `is_main` 플래그로만 분기해야 한다.

### 4.5 유지보수성 (Maintainability)
- NFR-11: 분류 규칙(`classifier.py`)과 도메인 모델(`schemas.py`), API 라우팅(`main.py`), 외부 연동(`gmail_client.py`)이 모듈별로 분리되어 있어야 한다.
- NFR-12: 분류 로직의 핵심 동작(카테고리별 매칭, 보안 메일의 LLM 차단)은 자동화 테스트로 보호되어야 한다.

---

## 5. 외부 인터페이스 요구사항 (External Interface Requirements)

### 5.1 사용자 인터페이스 (UI)
- 상단 바: 앱 이름, 데이터 소스 선택(`select#source-select`), "Gmail에 라벨 적용" 체크박스, "분류 실행" 버튼.
- 요약 칩 영역, 카테고리 탭, 메인 3섹션(3열 카드 그리드, 좁은 화면 1열), 하단 "기타 알림" 요약, 에러 배너.
- 모든 텍스트는 한국어(`ko`)로 표시.

### 5.2 하드웨어 인터페이스
- 별도 하드웨어 인터페이스 없음. 표준 PC/노트북 + 모던 웹 브라우저면 충분.

### 5.3 소프트웨어 인터페이스 (API / 데이터 모델)

**REST API**

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/health` | 헬스 체크 |
| GET | `/api/categories` | 카테고리 메타데이터 목록 |
| GET | `/api/emails?source=&category=&limit=` | 분류된 메일 목록 조회 |
| POST | `/api/classify` | `{source, limit, apply_labels}` → 조회 + 분류 (+ 선택적 Gmail 라벨 적용) |
| POST | `/api/emails/{id}/override` | `{category}` → 수동 정정 저장 |

**데이터 모델 (Pydantic)**

| 모델 | 필드 |
|---|---|
| `EmailMessage` | `id, thread_id, sender, subject, snippet, date, has_list_unsubscribe` |
| `ClassificationResult` | `category, confidence, matched_rule` |
| `ClassifiedEmail` | `email, result` |
| `CategoryInfo` | `id, label_ko, color, is_main` |

**외부 API 의존성**
- Gmail API v1 (`google-api-python-client`) — `users().messages().list/get`, `users().labels().list/create`, `users().messages().modify`. 스코프: `gmail.modify`.
- Anthropic API (`anthropic` SDK) — 모델 `claude-haiku-4-5-20251001`, 단일 텍스트 분류 프롬프트.

### 5.4 통신 인터페이스
- 프로토콜: HTTP/1.1 (로컬, `http://localhost:8000`).
- 데이터 포맷: JSON (요청/응답), 정적 자산은 HTML/CSS/JS.
- 인증: 앱 자체에는 인증 계층 없음(로컬 단일 사용자 전제). Gmail/Anthropic 호출에는 각각 OAuth2 / API 키 인증 사용.

---

## 6. 시스템 아키텍처 / 설계 개요

```
backend/app/main.py        — FastAPI 라우트, 정적 프론트 서빙(StaticFiles), 인메모리 override 캐시
backend/app/classifier.py  — 규칙 테이블 + classify_email() + needs_llm_fallback() + llm_classify_fallback()
backend/app/schemas.py     — Category enum, CATEGORY_META, MAIN/MINOR_CATEGORY_ORDER, Pydantic 모델
backend/app/gmail_client.py— OAuth 토큰 로드, 메일 조회, 라벨 생성/적용
backend/app/sample_data.py — 데모 이메일 12건
backend/app/config.py      — .env 기반 Settings (pydantic-settings)
frontend/app.js            — fetch 기반 SPA: state, renderHome/renderList, override 처리
```

**요청 흐름 (분류 실행)**
1. 브라우저 → `POST /api/classify {source, limit, apply_labels}`
2. `main.py`가 `_fetch_source_emails()`로 메일 조회
3. `_classify_all()`이 각 메일에 대해 override 캐시 확인 → 없으면 `classify_with_fallback()` 호출
4. `classify_with_fallback()` → `classify_email()`(규칙) → 필요 시 `llm_classify_fallback()`(보조)
5. `Counter`로 집계 후 `{emails, counts}` JSON 응답
6. 프론트가 `is_main` 플래그로 메인 3섹션 / 기타 요약을 분기 렌더링

---

## 7. 요구사항 추적성 매트릭스 (RTM)

| 요구사항 ID | 구현 위치 | 검증 방법 | 현재 상태 |
|---|---|---|---|
| FR-01 | `main.py: get_categories()` | curl `/api/categories` 응답 확인 | 검증됨 (수동) |
| FR-02 | `main.py: _fetch_source_emails()` | 데모: pytest 간접 확인 / Gmail: 코드 경로만 점검(자격증명 없는 환경) | 부분 검증 |
| FR-03 | `classifier.py: classify_email()` | `test_payment_email_is_classified_as_payment`, `test_newsletter_email_is_classified_as_newsletter`, `test_promotion_email_is_classified_as_promotion`, `test_work_email_is_classified_as_work`, `test_verification_code_email_is_classified_as_security` | 자동화 테스트로 검증됨 |
| FR-04 | `classifier.py: classify_email()`, `needs_llm_fallback()` | `test_security_email_never_needs_llm_fallback` | 자동화 테스트로 검증됨 (단, NFR-03의 설정 연동 갭은 별도) |
| FR-05 | `classifier.py: llm_classify_fallback()`, `needs_llm_fallback()` | `test_unmatched_email_falls_back_to_other_and_needs_llm` (LLM 호출 자체는 API 키 필요해 미검증) | 부분 검증 |
| FR-06 | `schemas.ClassificationResult`, `app.js: renderCard()` | Playwright 스크린샷으로 "근거: ... (%)" 표시 확인 | 검증됨 (수동) |
| FR-07 | `app.js: renderSummary()` | Playwright 스크린샷으로 요약 칩 확인 | 검증됨 (수동) |
| FR-08 | `schemas.MAIN/MINOR_CATEGORY_ORDER`, `app.js: renderHome()` | Playwright 스크린샷으로 메인 3섹션 + 기타 요약 확인 | 검증됨 (수동) |
| FR-09 | `app.js: renderTabs(), renderList()` | Playwright로 카테고리 탭 클릭 → 평면 리스트 전환 확인 | 검증됨 (수동) |
| FR-10 | `main.py: override_category()`, `app.js: overrideCategory()` | Playwright로 드롭다운 변경 → 카운트 변화 확인 | 검증됨 (수동) |
| FR-11 | `gmail_client.py: ensure_label(), apply_label()` | 자격증명 없는 환경에서 코드 경로만 점검 | 미검증 (실 Gmail 계정 필요) |
| FR-12 | `scripts/gmail_auth.py`, `gmail_client.py: _load_credentials()` | 자격증명 없는 환경에서 에러 메시지 경로만 점검 | 미검증 (실 Gmail 계정 필요) |
| FR-13 | `main.py: health()` | 코드 리뷰 | 검증됨 (자명) |
| NFR-03 | `classifier.py` (하드코딩) | `test_security_email_never_needs_llm_fallback` | 동작은 보장되나 설정 연동은 미검증/미구현 (보완 대상) |
| NFR-05 | `gmail_client.py: SCOPES` | 코드 리뷰 | 미보완 (보완 대상) |
| NFR-06 | `classifier.py: llm_classify_fallback()` | 없음 | 미보완 (보완 대상) |

---

## 8. 부록 (Appendices)

### 8.1 카테고리 표시명 ↔ 내부 id 매핑

| 표시명 | 내부 id |
|---|---|
| 보안 | `security` |
| 영수증 | `payment` |
| 업무 | `work` |
| 프로모션 | `promotion` |
| 오늘의 소식 | `newsletter` |
| 기타 | `other` |

### 8.2 알려진 제약 및 추후 보완 항목
`기획서.md` 14장(보안 검토 결과)에 정리된 항목 — `SECURITY_LLM_BLOCK` 죽은 설정, OAuth 스코프 과다, 인증/rate limit 부재, 프롬프트 인젝션 미대응 — 은 이 SRS의 NFR-03/NFR-05/NFR-06과 직접 연결되며, 별도 작업 사이클에서 보완 예정이다.

### 8.3 참고 자료
- `README.md` (실행/연동 가이드)
- `기획서.md` (기획 의도, 화면 설계, 보안 검토)
