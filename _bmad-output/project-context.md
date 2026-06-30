---
project_name: 'AX_automatization_miniproject'
user_name: 'Root'
date: '2026-06-30'
sections_completed: ['technology_stack', 'python_fastapi', 'domain_rules', 'gmail_integration', 'testing', 'frontend', 'workflow', 'dont_miss_rules']
status: 'complete'
rule_count: 17
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

**의도적 설계 선택 (ADR):** DB·빌드 도구 없음은 미니프로젝트 범위에 맞춘 의도적 선택이다.
확장 시 가장 먼저 깨지는 지점은 인메모리 override 상태(`main.py`의 `_overrides`) —
프로세스 재시작 시 수동 정정 기록이 전부 사라진다.

**Core Stack:**
- Python 3 + FastAPI 0.115.0 + pydantic 2.9.2 + uvicorn[standard] 0.30.6
- Gmail 연동: google-api-python-client 2.149.0, google-auth 2.35.0, google-auth-oauthlib 1.2.1, google-auth-httplib2 0.2.0
- LLM 폴백: anthropic 0.39.0 (선택적, 없으면 규칙만 사용)
- 테스트: pytest 8.3.3, httpx 0.27.2
- 프론트엔드: 빌드 없는 vanilla HTML/CSS/JS, FastAPI가 같은 포트로 정적 서빙
- DB 없음 (인메모리 캐시만)

**카테고리 우선순위 + 핵심 파일 위치**

| 카테고리 | 우선순위 | 비고 |
|---|---|---|
| SECURITY | 최우선, `classify_email()` 안에서 즉시 확정 | LLM에 절대 전달 안 됨 |
| PAYMENT | `_RULE_TABLE` 1번 | 동점 시 가장 먼저 선택됨 |
| WORK | `_RULE_TABLE` 2번 | |
| ANNOUNCEMENT | `_RULE_TABLE` 3번 | |
| PROMOTION | `_RULE_TABLE` 4번 | |
| NEWSLETTER | `_RULE_TABLE` 5번 | List-Unsubscribe 헤더 시 +2 가산, 그래도 동점 시 순서를 못 뒤집을 수 있음 |
| OTHER | 매칭 0건 또는 LLM 폴백 결과 | |

| 파일 | 역할 |
|---|---|
| `backend/app/classifier.py` | 분류 규칙 테이블 + LLM 폴백 |
| `backend/app/schemas.py` | `Category` enum, `CATEGORY_META`, `MAIN_CATEGORY_ORDER`/`MINOR_CATEGORY_ORDER` |
| `backend/app/gmail_client.py` | Gmail OAuth, 라벨 생성/적용, 재시도·백오프 |
| `backend/app/main.py` | API 라우트, 인메모리 `_overrides` 캐시 |
| `frontend/app.js` | 대시보드 렌더링, 이벤트 리스너 등록 |
| `DEBUGGING_LOG.md` | 실제 운영 버그 사고 이력 (증상→원인분석→수정→검증) |

## Critical Implementation Rules

### Python/FastAPI 규칙
- `llm_classify_fallback()`처럼 선택적 의존성(`anthropic`)은 함수 내부에서 lazy import한다 — 모듈 최상단 import 시 API 키/패키지 없는 환경에서 앱 전체가 죽는다.

### 도메인 핵심 규칙
- **SECURITY 이중 가드(최우선, 절대 약화 금지):** `classify_email()`(`classifier.py:87-93`)에서 SECURITY 매칭 시 즉시 `return` — 이후 코드(LLM 폴백 경로)에 도달 자체를 안 함. `needs_llm_fallback()`(`classifier.py:133-134`)에서 한 번 더 명시적으로 재차단. 두 함수는 한 쌍으로 움직여야 하며, 한쪽만 리팩토링하면 보호가 깨질 수 있다.
- `Category` enum 값(id)과 `CATEGORY_META[...].label_ko`(표시 라벨)는 분리되어 있다 — 라벨만 바꿀 땐 `label_ko`만, Gmail 라벨명/분류 로직을 바꿀 땐 별개로 다뤄야 한다.
- `MAIN_CATEGORY_ORDER`/`MINOR_CATEGORY_ORDER`(`schemas.py`)는 홈 화면 섹션 순서를 결정 — 새 카테고리 추가 시 여기 안 넣으면 화면에 안 나타난다.

### Gmail API 연동 규칙
- 라벨 생성 직후 즉시 사용하면 Gmail 쪽 전파 지연으로 `labelId not found`가 날 수 있다 — `ensure_label()`은 생성 후 `_wait_until_label_usable()`로 폴링 확인한다.
- 대량 라벨 적용(batch)은 버스트 레이트리밋에 걸릴 수 있다 — 지수 백오프(0.5s→1s→2s→4s→4s)로 재시도하고, 끝까지 실패한 메일은 예외를 던지지 않고 실패 ID 목록으로 반환해 부분 실패를 허용한다(전체 요청을 500으로 죽이지 않음).

### 테스트 규칙
- `tests/test_classifier.py`는 카테고리별 규칙 매칭 + "SECURITY 메일은 LLM 호출 경로에 도달하지 않는다"를 단위 테스트로 검증한다. 분류 로직을 바꿀 때마다 이 테스트가 통과하는지 반드시 확인.

### 프론트엔드(vanilla JS) 규칙
- 셀렉트/드롭다운 등 새 컨트롤을 추가하면 `change` 이벤트 리스너를 반드시 같이 등록해야 한다 — 빠뜨리면 화면에 컨트롤은 보이지만 동작하지 않는다(과거 실제 사고 이력: `DEBUGGING_LOG.md` 참조).
- `source-select`(데모/Gmail 전환)는 의도적으로 자동 재조회를 하지 않는다 — Gmail 라벨 적용 체크박스 상태와 얽혀 있어, 자동 재조회를 붙이면 의도치 않게 실제 Gmail 라벨이 적용될 수 있다.

### Development Workflow 규칙
- 현재 작업 브랜치는 `git branch`로 직접 확인할 것(브랜치명을 문서에 하드코딩하지 않음).

## Critical Don't-Miss Rules

1. **SECURITY 이중 가드를 절대 약화하지 말 것** — `classifier.py:87-93`(즉시 확정) + `classifier.py:133-134`(재차단). 이 두 줄을 분리해서 리팩토링하면 민감 정보가 LLM으로 샐 수 있다.
2. SECURITY는 다른 카테고리와 달리 `*_SENDERS`(발신자 패턴) 보완 목록이 없다 — 오직 키워드 매칭에만 의존하므로, `SECURITY_KEYWORDS`에 없는 표현을 쓰는 메일은 새어나갈 수 있다.
3. LLM 폴백은 "규칙 점수가 정확히 0"(`OTHER` + `matched_rule == "no_rule_matched"`)일 때만 호출된다 — 점수 1점짜리 애매한 매칭도 LLM로 안 가고 그대로 확정된다.
4. `ANTHROPIC_API_KEY` 없거나 `USE_LLM_FALLBACK=false`면 자동으로 규칙만 사용해 우아하게 동작한다 — "LLM이 필수"라고 가정하고 코드를 짜면 안 된다.
5. 분류 결과는 캐시되지 않는다 — 사용자가 수동 정정(override)한 카테고리가 항상 재분류 결과보다 우선해야 하며, 세션 간 격리도 없다(단일 인메모리 딕셔너리).
6. 대량 조회("전체" 선택)는 안전 상한 2000건이 있다 — 무한정 조회되지 않으며, 한도에 걸려도 사용자에게 별도 경고는 없다.
7. Gmail 라벨 적용 실패는 부분 실패로 우아하게 처리되지만, Anthropic API 호출 실패는 미처리 예외로 요청 전체를 500으로 죽일 수 있다 — 둘의 에러 내성 수준이 다르다.

---

## Usage Guidelines

**For AI Agents:**
- 코드를 구현하기 전에 이 파일을 먼저 읽을 것
- 모든 규칙을 예외 없이 따를 것
- 애매하면 더 보수적인(안전한) 쪽을 선택할 것 — 특히 SECURITY 관련 규칙
- 새로운 패턴이 발견되면 이 파일을 업데이트할 것

**For Humans:**
- 에이전트를 위한 용도에 집중해 린(lean)하게 유지할 것
- 기술 스택이 바뀌면 업데이트할 것
- 분기마다 한 번씩 오래된 규칙이 없는지 검토할 것
- 시간이 지나 당연해진 규칙은 제거할 것

Last Updated: 2026-06-30
