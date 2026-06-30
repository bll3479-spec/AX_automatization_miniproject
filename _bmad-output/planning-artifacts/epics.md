---
stepsCompleted: [1, 2, 3]
inputDocuments: [
  "_bmad-output/planning-artifacts/prds/prd-AX_automatization_miniproject-2026-06-30/prd.md",
  "_bmad-output/planning-artifacts/architecture/architecture-AX_automatization_miniproject-2026-06-30/ARCHITECTURE-SPINE.md",
  "_bmad-output/planning-artifacts/briefs/brief-AX_automatization_miniproject-2026-06-30/brief.md",
  "_bmad-output/planning-artifacts/briefs/brief-AX_automatization_miniproject-2026-06-30/addendum.md"
]
---

# 자봐 (AX_automatization_miniproject) - Epic Breakdown

## Overview

이 문서는 자봐 PRD(분류 규칙 보강 및 기능 확장)와 아키텍처 스파인의 설계 불변사항(AD-1~4)을 구현 가능한 에픽/스토리 단위로 분해한 것이다. UX 설계 문서는 별도로 작성되지 않아 입력에서 제외했고, 대신 사용자 요청에 따라 브리프(`brief.md`, `addendum.md`)를 보조 입력으로 포함해 사례별 원본 증거(발신자 주소, 점수 계산 근거)를 스토리의 Acceptance Criteria에 직접 인용한다.

## Requirements Inventory

### Functional Requirements

FR-1: `PROMOTION_SENDERS` 리스트를 신설하고 최소 `"promo"` 패턴을 포함해 `_RULE_TABLE`의 PROMOTION 항목에 반영한다 (사례 1: `promos@wellness.iherb.com`).
FR-2: `PAYMENT_KEYWORDS`에 멤버십 계열 키워드(예: "멤버십")를 추가해 사례 3(쿠팡 와우 멤버십 영수증이 PROMOTION으로 역전되는 문제)을 완화한다. ("정기결제"는 이미 `PAYMENT_KEYWORDS`에 포함되어 있어 추가 작업이 필요 없다.)
FR-3: `tests/test_classifier.py`에 사례 1·2·3 각각의 회귀 테스트를 추가한다. 사례 2는 코드 변경이 없는 "정상 동작" 케이스이므로, List-Unsubscribe 메커니즘이 의도대로 동작함을 고정하는 회귀 테스트로 포함한다.
FR-4: `Category` enum에 신규 항목 `report`(한글 라벨 "보고서 및 간행물")를 추가한다.
FR-5: 신규 `*_SENDERS` 리스트를 만들고 최소 `"seoul.go.kr"`, `"nabo.go.kr"` 패턴을 포함해 `_RULE_TABLE`에 반영한다 (addendum.md 사례 4 증거 기준). `nanet.go.kr`(국회도서관)은 실증된 수신 메일이 없어 이번 범위에서 제외한다.
FR-6: `CATEGORY_META`에 라벨/색상을 등록하고, 빈도가 낮은 카테고리이므로 `MINOR_CATEGORY_ORDER`에 배치한다.
FR-7: `tests/test_classifier.py`에 사례 4 회귀 테스트를 추가한다. 발신자 매칭이 PROMOTION 키워드 충돌(예: `inews11@seoul.go.kr`의 "15% 할인" 메일)을 이기는지도 함께 검증한다.
FR-8: 프론트엔드가 다건 분류 처리 중 진행률(%)을 표시한다. 별도 서버 인프라(WebSocket/SSE) 없이, 프론트엔드가 `/api/classify` 호출을 일정 단위(batch)로 나눠 보내고 "처리된 건수/전체 건수"로 진행률을 계산하는 방식으로 구현한다 — 백엔드에 배치 단위 처리 지원 추가가 필요하다.
FR-9: 분류가 완료되면 "분류 완료" 표시를 노출한다(버튼 근처 또는 팝업).
FR-10: 프론트엔드는 override 변경 사항을 로컬에 스테이징하고, 변경 즉시 백엔드를 호출하거나 `runClassify()`를 재실행하지 않는다.
FR-11: 사용자가 명시적으로 "적용" 액션을 실행했을 때만 스테이징된 변경 사항 전체를 백엔드에 반영하고, 단 한 번만 재분류를 실행한다.
FR-12: 적용되지 않은 변경 사항이 있을 때 이를 시각적으로 표시한다(예: "적용" 버튼 활성화 또는 배지).

### NonFunctional Requirements

NFR-1: SECURITY 이중 가드(`classifier.py:87-93`, `133-134`)는 어떤 변경에도 약화되지 않는다.
NFR-2: 분류 점수 계산 알고리즘(가중치, List-Unsubscribe 보너스)은 변경하지 않는다.
NFR-3: 기존 `test_classifier.py` 11개 테스트는 회귀 없이 통과해야 한다.
NFR-4: LLM 폴백 로직은 변경하지 않는다.

### Additional Requirements

(아키텍처 스파인 AD-1~4 및 Stack 섹션에서 도출)

- 신규 의존성 추가 없음 — 기존 스택(fastapi 0.115.0, pydantic 2.9.2, anthropic 0.39.0 등) 내에서만 구현한다. 스타터 템플릿 적용 대상 아님(브라운필드, 기존 코드베이스 확장).
- [AD-1] `classify_email()`의 SECURITY 즉시 `return`(87-93)과 `needs_llm_fallback()`의 명시적 재차단(127-135)은 항상 한 쌍으로 유지 — 한쪽만 리팩토링해 분리 금지.
- [AD-2] 신규 카테고리·키워드·발신자는 `_RULE_TABLE`에 `(Category, KEYWORDS, SENDERS)` 행을 추가/확장하는 것으로만 구현 — `score = len(kw_hits) + len(sender_hits) * 2` 계산식과 NEWSLETTER `+2` 보너스 자체는 수정 금지.
- [AD-3] 이메일 목록 조회(fetch)와 분류 실행(classify)을 별도 API 단계로 분리. 목록은 1회만 가져오고, 분류는 그 목록의 부분집합을 입력으로 받는 배치 호출로 N회 반복. 배치 classify 엔드포인트는 입력으로 받은 이메일 목록만 처리하며 source를 다시 조회하지 않음. (신규 엔드포인트: `GET /api/emails/raw`, `POST /api/classify/batch`)
- [AD-4] `POST /api/emails/{id}/override`의 시그니처는 변경하지 않음. 프론트엔드는 정정사항을 로컬에 스테이징하고, "적용" 액션 1회당 (1) 스테이징된 건수만큼 override 엔드포인트를 호출한 뒤 (2) AD-3의 classify-batch 경로를 재사용해 재분류를 정확히 1회만 트리거. 이 재분류도 source를 재조회하지 않고 이미 메모리에 있는 raw 이메일 목록(`state.rawEmails`)을 재사용.
- [브라운필드 컨벤션] 카테고리 id는 `Category` enum 값(영문 소문자)이 유일한 식별자이며, 한글 라벨(`label_ko`)은 표시 전용이다 — 분류 로직이나 Gmail 라벨명에 라벨 텍스트를 직접 사용하지 않음.
- [브라운필드 컨벤션] 백엔드 상태는 `_overrides` 딕셔너리 하나로 한정(DB 없음, 프로세스 재시작 시 소실). override는 항상 규칙 기반 재분류 결과보다 우선(`_classify_all`이 `_overrides`를 먼저 확인).
- [원본 증거 — addendum.md 사례 1] 발신자 `promos@wellness.iherb.com`, 현재 PROMOTION 키워드 2점 vs WORK 키워드("마감") 1점으로 마진이 위태로움 → `PROMOTION_SENDERS`에 `"promo"` 추가 시 발신자 매칭 +2점으로 마진 안정화(총 4점).
- [원본 증거 — addendum.md 사례 3] 발신자 `no_reply@coupang.com`, 제목 "와우 멤버십 월회비가 결제되었습니다" — PAYMENT 키워드 1점("결제") vs PROMOTION 키워드 2점("할인","무료배송")으로 현재 PROMOTION 오분류. 발신자 패턴만으로는 근본 해결 어려움(같은 발신자가 결제/프로모션 메일을 함께 보냄) — PAYMENT_KEYWORDS에 "정기결제"/"멤버십" 추가로 완화.
- [원본 증거 — addendum.md 사례 4] `w3@nabo.go.kr`(국회예산정책처 NABO), `noreply@seoul.go.kr`/`inews11@seoul.go.kr`/`opendata@seoul.go.kr`(서울시, 도메인 공통 `seoul.go.kr`) — 신규 "보고서 및 간행물" 카테고리의 발신자 근거. 충돌 위험: `inews11@seoul.go.kr` 발신 메일 중 "15% 할인" 등 PROMOTION 키워드 포함 사례 존재 — 발신자 가중치(+2)가 일반적으로 우세하나 회귀 테스트로 고정 필요.
- [브리프 Known Limitations] WORK_KEYWORDS의 "마감"이 프로모션 카피("세일 마감임박")에도 흔히 등장 — PROMOTION 키워드가 1개뿐인 메일에서 WORK로 오분류될 위험이 모니터링 대상으로 남음(이번 범위에서 근본 해결 안 함).

### UX Design Requirements

(해당 없음 — 별도 UX 설계 문서 없음. F3 진행률 UI/F4 일괄 적용 배지 관련 화면 요구사항은 위 FR-8~12에 포함되어 있으며, 시각적 세부사항은 스토리 작성 단계에서 기존 `frontend/styles.css` 컨벤션을 따른다.)

### FR Coverage Map

FR-1: Epic 1 - PROMOTION_SENDERS 신설
FR-2: Epic 1 - PAYMENT_KEYWORDS 정기결제/멤버십 키워드 추가
FR-3: Epic 1 - 사례 1·2·3 회귀 테스트
FR-4: Epic 2 - Category.report enum 추가
FR-5: Epic 2 - 신규 *_SENDERS 리스트(seoul.go.kr, nabo.go.kr)
FR-6: Epic 2 - CATEGORY_META/MINOR_CATEGORY_ORDER 등록
FR-7: Epic 2 - 사례 4 회귀 테스트
FR-8: Epic 3 - 배치 분류 + 진행률(%) 표시
FR-9: Epic 3 - 분류 완료 표시
FR-10: Epic 4 - override 로컬 스테이징
FR-11: Epic 4 - "적용" 1회 액션으로 일괄 반영 + 단일 재분류
FR-12: Epic 4 - 미적용 변경사항 시각적 표시

## Epic List

### Epic 1: 분류 규칙 정확도 보강
사용자가 보고한 오분류 사례(프로모션 메일이 결제로, 쿠팡 멤버십 결제가 프로모션으로 잘못 분류되는 문제)가 해결되어, 대시보드 분류 결과를 더 신뢰할 수 있게 된다.
**FRs covered:** FR-1, FR-2, FR-3
**독립성:** classifier.py 키워드/발신자 리스트 확장만으로 완결. 다른 에픽에 의존하지 않음.

### Epic 2: 신규 카테고리 "보고서 및 간행물"
공공기관 발간물 메일(서울시, 국회예산정책처)이 더 이상 "기타"로 묻히지 않고 별도 카테고리로 명확히 분류되어 보인다.
**FRs covered:** FR-4, FR-5, FR-6, FR-7
**독립성:** Category enum 확장 + _RULE_TABLE 행 추가로 완결. 에픽 1과 독립적으로 구현 가능(순서 무관).

### Epic 3: 분류 진행률 UI
다건 메일을 분류하는 동안 사용자가 진행 상황(%)을 실시간으로 확인하고, 완료 시 완료 표시를 본다.
**FRs covered:** FR-8, FR-9
**독립성:** GET /api/emails/raw + POST /api/classify/batch 신규 엔드포인트와 프론트엔드 배치 진행률 렌더링으로 완결.

### Epic 4: 수동 정정 일괄 적용 플로우
사용자가 여러 건의 카테고리를 고친 뒤, 매번 기다리지 않고 한 번의 "적용" 클릭으로 모두 반영한다.
**FRs covered:** FR-10, FR-11, FR-12
**의존성:** 에픽 3의 POST /api/classify/batch를 재사용하므로 에픽 3 이후에 구현되어야 함.

## Epic 1: 분류 규칙 정확도 보강

**Goal:** 사용자가 보고한 오분류 사례(프로모션 메일이 결제로, 쿠팡 멤버십 결제가 프로모션으로 잘못 분류되는 문제)가 해결되어, 대시보드 분류 결과를 더 신뢰할 수 있게 된다.
**FRs covered:** FR-1, FR-2, FR-3 | **Governed by:** AD-2 (NFR-2) | **NFR:** NFR-3 (기존 11개 테스트 회귀 없음)

### Story 1.1: PROMOTION 발신자 패턴 보강

As a 자봐 사용자,
I want `promos@wellness.iherb.com`처럼 "promo"가 포함된 발신자 주소가 PROMOTION으로 안정적으로 분류되기를,
So that 프로모션 메일이 다른 카테고리(WORK 등)와의 점수 마진이 위태로워 흔들리지 않고 일관되게 분류된다.

**Acceptance Criteria:**

**Given** `classifier.py`의 `_RULE_TABLE`에 PROMOTION 행이 존재하고 현재 `PROMOTION_SENDERS`가 비어 있는 상태에서
**When** `PROMOTION_SENDERS` 리스트를 신설하고 최소 `"promo"` 패턴을 추가해 PROMOTION 행의 SENDERS에 반영하면
**Then** 발신자 `promos@wellness.iherb.com`, 제목 "라스트 찬스! 2개 구매 시 1개 80% 할인"인 메일은 PROMOTION 키워드 2점("세일","할인") + 발신자 매칭 1개×2 = 총 4점으로 분류되어, WORK 키워드 1점("마감")과의 마진이 1점에서 3점으로 안정화된다 (addendum.md 사례 1 근거)
**And** `score = len(kw_hits) + len(sender_hits) * 2` 계산식 자체는 수정하지 않는다 (AD-2/NFR-2 준수)
**And** SECURITY 이중 가드(`classifier.py:87-93`, `127-135`)는 변경하지 않는다 (NFR-1)

### Story 1.2: PAYMENT 키워드에 정기결제/멤버십 보강

As a 자봐 사용자,
I want 쿠팡 와우 멤버십 월회비 같은 정기결제/멤버십 영수증 메일이 PAYMENT로 정확히 분류되기를,
So that 결제 영수증이 프로모션 메일로 역전 분류되어 놓치는 일이 없다.

**Acceptance Criteria:**

**Given** `PAYMENT_KEYWORDS`에 이미 "정기결제"는 포함되어 있지만 "멤버십" 계열 키워드가 없어 발신자 `no_reply@coupang.com`의 "와우 멤버십 월회비가 결제되었습니다" 메일이 PAYMENT 1점("결제") vs PROMOTION 2점("할인","무료배송")으로 PROMOTION으로 오분류되는 상태에서 (addendum.md 사례 3 근거)
**When** `PAYMENT_KEYWORDS`에 "멤버십" 키워드를 추가해 `_RULE_TABLE`의 PAYMENT 행에 반영하면
**Then** 동일 메일은 PAYMENT 키워드 매칭이 ["결제","멤버십"] 2점으로 늘어나 PROMOTION(2점)과 동점 이상이 되어 우선순위 규칙(또는 동점 처리 로직)에 따라 PAYMENT로 분류되거나, 최소한 PROMOTION 단독 우위가 해소된다
**And** 발신자 패턴(`PAYMENT_SENDERS`)만으로는 근본 해결이 어렵다는 점(같은 발신자가 결제/프로모션 메일을 함께 보냄)을 감안해 키워드 보강만으로 구현한다 — `PAYMENT_SENDERS`에 쿠팡 패턴을 새로 추가하지 않는다
**And** 점수 계산식과 NEWSLETTER `+2` 보너스는 수정하지 않는다 (AD-2/NFR-2 준수)

### Story 1.3: 사례 1·2·3 회귀 테스트 고정

As a 자봐 개발자,
I want 사례 1(PROMOTION 발신자), 사례 2(List-Unsubscribe 정상 동작), 사례 3(PAYMENT 키워드 보강) 각각의 회귀 테스트가 `tests/test_classifier.py`에 추가되기를,
So that 향후 변경이 이 세 가지 오분류 수정을 다시 깨뜨리지 않는다는 것을 자동으로 검증할 수 있다.

**Given** `tests/test_classifier.py`에 기존 11개 테스트가 존재하고 사례 1·2·3에 대한 회귀 테스트가 없는 상태에서
**When** 사례 1(발신자 `promos@wellness.iherb.com`, 제목 "라스트 찬스! ... 80% 할인" → PROMOTION 분류 검증), 사례 2(발신자 `neusral.news@neusral.com`, "결제" 키워드 포함 + List-Unsubscribe 헤더 존재 → NEWSLETTER 분류 검증, 코드 변경 없는 정상 동작 고정), 사례 3(발신자 `no_reply@coupang.com`, "와우 멤버십 월회비가 결제되었습니다" → PAYMENT 분류 검증) 각각의 테스트 함수를 추가하면
**Then** 신규 테스트 3건과 기존 테스트 11건을 합쳐 총 14건이 `pytest`로 모두 통과한다
**And** 사례 2 테스트는 코드 변경 없이도 통과해야 하며(List-Unsubscribe 메커니즘이 의도대로 동작함을 고정하는 회귀 테스트), 사례 1·3 테스트는 Story 1.1·1.2 구현 이후에만 통과한다
**And** NFR-3(기존 테스트 회귀 없음)을 만족함을 이 테스트 실행으로 증명한다

## Epic 2: 신규 카테고리 "보고서 및 간행물"

**Goal:** 공공기관 발간물 메일(서울시, 국회예산정책처)이 더 이상 "기타"로 묻히지 않고 별도 카테고리로 명확히 분류되어 보인다.
**FRs covered:** FR-4, FR-5, FR-6, FR-7 | **Governed by:** AD-2 | **브라운필드 컨벤션:** 카테고리 id는 `Category` enum 값(영문 소문자)이 유일한 식별자, 한글 라벨은 표시 전용

### Story 2.1: Category.report 추가 및 메타데이터 등록

As a 자봐 사용자,
I want 새 카테고리 "보고서 및 간행물"이 분류 체계와 화면 필터에 정식으로 등록되기를,
So that 공공기관 발간물 메일을 위한 카테고리가 다른 카테고리들과 동일하게 화면에서 식별·필터링된다.

**Acceptance Criteria:**

**Given** `Category` enum에 `report` 항목이 없고 `CATEGORY_META`에도 등록되어 있지 않은 상태에서
**When** `Category` enum에 신규 항목 `report`(한글 라벨 "보고서 및 간행물")를 추가하고, `CATEGORY_META`에 라벨/색상을 등록하면
**Then** `GET /api/categories` 응답에 `report` 카테고리가 다른 카테고리와 동일한 형태(id, label_ko, color)로 포함된다
**And** 빈도가 낮은 카테고리이므로 `MINOR_CATEGORY_ORDER`에 배치되어 화면 표시 순서가 정해진다
**And** 카테고리 id(`report`, 영문 소문자)만 분류 로직과 Gmail 라벨명에 사용되고, 한글 라벨("보고서 및 간행물")은 표시 전용으로만 쓰인다 (브라운필드 컨벤션 준수)

### Story 2.2: REPORT 발신자 패턴 추가

As a 자봐 사용자,
I want 서울시(`seoul.go.kr`)와 국회예산정책처(`nabo.go.kr`)에서 온 메일이 "보고서 및 간행물"로 자동 분류되기를,
So that 매번 수동으로 분류를 고치지 않아도 공공기관 발간물 메일을 한눈에 모아볼 수 있다.

**Acceptance Criteria:**

**Given** Story 2.1로 `Category.report`가 존재하고, `_RULE_TABLE`에 REPORT 행이 아직 없는 상태에서
**When** 신규 `REPORT_SENDERS` 리스트를 만들어 최소 `"seoul.go.kr"`, `"nabo.go.kr"` 패턴을 포함시키고 `_RULE_TABLE`에 `(Category.report, REPORT_KEYWORDS, REPORT_SENDERS)` 행으로 반영하면
**Then** 발신자 `w3@nabo.go.kr`(예: "[NABO Focus 제168호] ..."), `noreply@seoul.go.kr`, `inews11@seoul.go.kr`, `opendata@seoul.go.kr` 발신 메일이 모두 REPORT로 분류된다 (addendum.md 사례 4 근거)
**And** `nanet.go.kr`(국회도서관) 패턴은 실증된 수신 메일이 없으므로 이번 범위에서 추가하지 않는다
**And** 점수 계산식(`score = len(kw_hits) + len(sender_hits) * 2`)은 수정하지 않는다 (AD-2 준수)

### Story 2.3: 사례 4 회귀 테스트 — PROMOTION 키워드 충돌 검증 포함

As a 자봐 개발자,
I want 사례 4(공공기관 발신자 REPORT 분류)와 발신자-키워드 충돌 케이스에 대한 회귀 테스트가 추가되기를,
So that 향후 변경이 REPORT 분류를, 특히 PROMOTION 키워드와 충돌하는 까다로운 케이스에서 다시 깨뜨리지 않는다는 것을 자동으로 검증할 수 있다.

**Given** `tests/test_classifier.py`에 REPORT 카테고리에 대한 테스트가 없는 상태에서
**When** Story 2.2 구현 이후, 발신자 `noreply@seoul.go.kr`/`w3@nabo.go.kr` 등 일반 REPORT 메일의 분류를 검증하는 테스트와, 발신자 `inews11@seoul.go.kr`이 보낸 "15% 할인에 페이백까지…7월 1일 배달상품권 발행"(thread id `19ef62903a6b0c7f`) 메일이 PROMOTION 키워드("할인")를 포함함에도 REPORT로 분류되는지(발신자 매칭 +2점이 PROMOTION 키워드 매칭을 이김) 검증하는 테스트를 추가하면
**Then** 신규 테스트가 Story 1.3의 14건에 더해 모두 `pytest`로 통과한다
**And** 발신자 가중치가 PROMOTION 키워드 충돌을 이기지 못하는 경우(예: PROMOTION 키워드가 다수 겹치는 메일)는 이번 범위의 회귀 테스트로 고정하지 않고, 향후 모니터링 대상으로 별도 기록한다 (addendum.md 사례 4 "충돌 위험" 참고)
**And** NFR-3(기존 테스트 회귀 없음)을 만족함을 이 테스트 실행으로 증명한다

## Epic 3: 분류 진행률 UI

**Goal:** 다건 메일을 분류하는 동안 사용자가 진행 상황(%)을 실시간으로 확인하고, 완료 시 완료 표시를 본다.
**FRs covered:** FR-8, FR-9 | **Governed by:** AD-3 | **Stack 제약:** 신규 의존성 추가 없음(WebSocket/SSE 불가), 빌드 없는 vanilla JS

### Story 3.1: GET /api/emails/raw 엔드포인트 추가

As a 자봐 프론트엔드,
I want 분류되지 않은 이메일 목록을 한 번에 가져올 수 있는 엔드포인트를,
So that 이후 배치 분류 단계에서 source(Gmail)를 반복 재조회하지 않고 이미 가져온 목록의 부분집합만 분류에 사용할 수 있다.

**Acceptance Criteria:**

**Given** 현재 `/api/classify`가 메일 조회와 분류를 한 번에 처리해 중간 진행 상황을 보여줄 방법이 없는 상태에서
**When** 신규 `GET /api/emails/raw?source=&limit=` 엔드포인트를 추가하면
**Then** 이 엔드포인트는 `source`(demo|gmail)에서 메일 목록을 조회해 분류 없이 `EmailMessage[]`(기존 `schemas.py`의 `EmailMessage` 타입 재사용)만 반환한다
**And** 이 엔드포인트는 이번 호출에서 Gmail/source를 1회만 조회하며, 분류 로직(`classifier.py`)을 전혀 호출하지 않는다
**And** 기존 `POST /api/classify` 엔드포인트의 동작과 시그니처는 변경하지 않는다(하위 호환 유지)

### Story 3.2: POST /api/classify/batch 엔드포인트 추가

As a 자봐 프론트엔드,
I want 이미 가져온 이메일 목록의 부분집합(배치)을 받아 분류만 수행하는 엔드포인트를,
So that 전체 목록을 여러 배치로 나눠 호출하면서 "처리된 건수/전체 건수"로 진행률을 계산할 수 있다.

**Acceptance Criteria:**

**Given** Story 3.1로 `GET /api/emails/raw`가 동작하는 상태에서
**When** 신규 `POST /api/classify/batch` 엔드포인트를 추가해 요청 본문으로 이메일 목록(chunk)을 받으면
**Then** 이 엔드포인트는 입력으로 받은 이메일 목록만 `classify_with_fallback()`으로 분류해 `ClassifiedEmail[]`을 반환하며, source(Gmail)를 다시 조회하지 않는다
**And** `_overrides`에 이미 정정 기록이 있는 이메일 id는 규칙 기반 재분류 결과보다 override가 우선 적용된다(기존 `_classify_all` 컨벤션 유지)
**And** SECURITY/LLM 폴백 로직(AD-1, NFR-1, NFR-4)은 배치 처리 여부와 무관하게 단건 분류 때와 동일하게 동작한다

### Story 3.3: 프론트엔드 배치 진행률 UI 및 완료 표시

As a 자봐 사용자,
I want 다건 메일을 분류하는 동안 진행률(%)을 보고, 완료되면 "분류 완료" 표시를 보기를,
So that 분류 작업이 멈춘 것인지 진행 중인지 알 수 없어 불안해하지 않고 처리 상황을 신뢰할 수 있다.

**Acceptance Criteria:**

**Given** Story 3.1·3.2로 백엔드 엔드포인트가 준비된 상태에서
**When** `frontend/app.js`가 `GET /api/emails/raw`를 1회 호출해 `state.rawEmails`에 전체 목록을 저장한 뒤, 이를 일정 단위(batch)로 나눠 `POST /api/classify/batch`를 N회 순차 호출하면
**Then** 각 배치 호출이 끝날 때마다 "처리된 건수/전체 건수"를 기반으로 진행률(%)이 화면에 갱신된다
**And** 별도 서버 인프라(WebSocket/SSE) 없이 순수 배치 호출 + 클라이언트 계산만으로 구현된다(신규 의존성 추가 없음)
**And** 모든 배치가 끝나면 버튼 근처 또는 팝업에 "분류 완료" 표시가 노출된다
**And** `GET /api/emails/raw` 결과(`state.rawEmails`)는 classify-batch 결과로 덮어쓰이지 않고 별도 필드로 유지된다(AD-3 컨벤션, Epic 4가 이 필드를 재사용)

## Epic 4: 수동 정정 일괄 적용 플로우

**Goal:** 사용자가 여러 건의 카테고리를 고친 뒤, 매번 기다리지 않고 한 번의 "적용" 클릭으로 모두 반영한다.
**FRs covered:** FR-10, FR-11, FR-12 | **Governed by:** AD-4 | **의존성:** Epic 3의 `POST /api/classify/batch`와 `state.rawEmails`를 재사용하므로 Epic 3 이후에 구현한다.

### Story 4.1: override 변경 사항 로컬 스테이징

As a 자봐 사용자,
I want 카테고리를 수동으로 정정할 때마다 즉시 서버에 반영되거나 전체가 재분류되지 않고, 일단 화면에만 임시로 모이기를,
So that 여러 건을 연달아 고치는 동안 매번 기다리지 않아도 된다.

**Acceptance Criteria:**

**Given** 현재 `overrideCategory()`가 정정 1건마다 즉시 백엔드를 호출하고 `runClassify()`를 재실행하는 상태(`frontend/app.js:348-355`)에서
**When** 사용자가 카드의 카테고리를 변경하면
**Then** 변경 사항은 `state.pendingOverrides`(신규 필드)에 로컬로 스테이징되고, 이 시점에는 백엔드 호출도 `runClassify()` 재실행도 일어나지 않는다
**And** 동일 이메일을 여러 번 고치면 가장 최근 값으로 스테이징 내용이 갱신된다(같은 id로 중복 누적되지 않음)
**And** `POST /api/emails/{id}/override` 엔드포인트의 시그니처는 변경하지 않는다(AD-4 준수)

### Story 4.2: "적용" 액션으로 일괄 반영 및 단일 재분류

As a 자봐 사용자,
I want "적용" 버튼을 눌렀을 때만 스테이징된 정정 사항 전체가 한 번에 반영되고 전체 재분류가 딱 한 번만 실행되기를,
So that 여러 건을 고친 결과를 한 번의 클릭으로 확정하고, 불필요한 반복 재분류로 기다리지 않는다.

**Acceptance Criteria:**

**Given** Story 4.1로 `state.pendingOverrides`에 N건이 스테이징된 상태에서
**When** 사용자가 "적용" 버튼을 클릭하면
**Then** 스테이징된 N건만큼 `POST /api/emails/{id}/override`가 순서대로 호출된 뒤, Epic 3의 `POST /api/classify/batch` 경로를 재사용해 재분류가 정확히 1회만 트리거된다
**And** 이 재분류는 source를 재조회하지 않고 이미 메모리에 있는 `state.rawEmails`를 재사용한다(AD-3/AD-4 준수)
**And** 재분류가 완료되면 `state.pendingOverrides`가 비워지고 화면이 갱신된 분류 결과로 다시 그려진다

### Story 4.3: 미적용 변경 사항 시각적 표시

As a 자봐 사용자,
I want 아직 "적용"하지 않은 정정 사항이 있을 때 이를 화면에서 바로 알아볼 수 있기를,
So that 변경한 내용을 깜빡 잊고 적용하지 않은 채로 두는 일이 없다.

**Acceptance Criteria:**

**Given** `state.pendingOverrides`가 비어 있을 때
**When** 사용자가 카드의 카테고리를 변경해 `state.pendingOverrides`에 1건 이상이 쌓이면
**Then** "적용" 버튼이 활성화되거나 배지(예: "N건 미적용")가 표시되어 미적용 변경 사항이 있음을 시각적으로 알 수 있다
**And** Story 4.2의 "적용" 액션이 완료되어 `state.pendingOverrides`가 비워지면 해당 표시는 다시 사라지거나 비활성 상태로 돌아간다
**And** 기존 카테고리 필터 탭과 카드별 override `<select>` UI는 그대로 유지된다(중복 구현 없음)
