# 자봐

이메일을 읽어 **오늘의 소식(뉴스레터) / 공고(채용) / 업무 / 영수증(결제) / 보안 / 프로모션 / 보고서 및 간행물 / 기타** 8개 카테고리로 자동 분류하고 태깅해주는 로컬 웹앱입니다. 첫 화면에는 가장 자주 보는 **오늘의 소식 / 공고 / 업무 / 영수증** 4개를 큰 섹션(2x2)으로 강조하고, 나머지(보안/프로모션/보고서 및 간행물/기타)는 하단에 작은 요약 리스트로 보여줍니다.

- 규칙(키워드/발신자/`List-Unsubscribe` 헤더) 기반으로 1차 분류하고, 규칙에 안 걸리는 애매한 메일만 (설정 시) Claude API로 보조 분류합니다.
- **보안**(인증번호, 로그인 알림, 비밀번호 재설정, 보안 알림 등) 카테고리로 판정된 메일은 내용이 절대 LLM에 전달되지 않습니다. 규칙 매칭만으로 로컬에서 확정됩니다.
- 데모 모드로 별도 설정 없이 즉시 동작을 확인할 수 있고, 실제 Gmail 계정과 연동해 라벨(`AX/payment`, `AX/newsletter` 등)을 직접 생성/적용할 수도 있습니다.
- 조회 건수는 20/50/100/500/전체 중 선택할 수 있고, 메일 조회와 라벨 적용 모두 Gmail API batch 요청으로 처리해 대량 메일에서도 빠르게 동작합니다. 카테고리별 목록은 페이지당 20건씩 페이지네이션됩니다.
- "분류 실행"을 누르면 메일 목록을 1회만 가져온 뒤 여러 배치로 나눠 분류하면서 진행률(%)과 완료 표시를 실시간으로 보여줍니다.
- 카드의 카테고리를 여러 건 고치는 동안에는 화면에만 임시로 모아두고, "적용" 버튼을 눌렀을 때 한 번에 반영 + 단일 재분류가 실행됩니다.

## 빠른 실행 (데모 모드)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows는 .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

브라우저에서 http://localhost:8000 접속 → "분류 실행" 클릭하면 샘플 이메일 14건이 카테고리별로 태깅되어 표시됩니다. API 키나 Gmail 설정 없이 바로 동작합니다.

## 실제 Gmail 계정과 연동하기

1. [Google Cloud Console](https://console.cloud.google.com)에서 프로젝트를 만들고 **Gmail API**를 활성화합니다.
2. "OAuth 클라이언트 ID" (애플리케이션 유형: 데스크톱 앱)를 만들고 JSON을 내려받아 `backend/credentials.json` 으로 저장합니다.
3. 최초 1회 인증을 진행합니다.
   ```bash
   cd backend
   cd scripts
   python /gmail_auth.py
   ```
   브라우저가 열리며 로그인/동의를 마치면 `backend/token.json`이 생성됩니다.
4. 앱을 실행하고 대시보드 상단에서 소스를 "실제 Gmail"로 바꾼 뒤 "분류 실행"을 누르면 받은편지함 최근 메일을 가져와 분류합니다.
5. "Gmail에 라벨 적용" 체크박스를 켜면 분류 결과에 따라 `AX/payment`, `AX/newsletter` 등의 라벨이 실제로 생성되고 메일에 적용됩니다. 대량 메일에서 Gmail 쪽 일시적인 레이트리밋으로 일부 라벨 적용이 실패하면 자동으로 재시도하며, 재시도 후에도 남는 실패는 전체 요청을 실패시키지 않고 화면에 실패 건수로 안내합니다.

`credentials.json`, `token.json`은 `.gitignore`에 포함되어 있어 커밋되지 않습니다.

## Claude API로 보조 분류 켜기 (선택)

규칙에 전혀 매칭되지 않는 애매한 메일을 Claude로 보조 분류하려면 `backend/.env.example`을 복사해 `backend/.env`로 만들고 키를 채웁니다.

```bash
cp backend/.env.example backend/.env
# backend/.env 안에 ANTHROPIC_API_KEY=sk-ant-... 입력
```

- `USE_LLM_FALLBACK=false`로 두면 규칙 기반 분류만 사용합니다 (API 키가 없어도 항상 이 모드로 동작).
- `SECURITY_LLM_BLOCK`은 항상 `true`로 두는 것을 권장합니다. 인증번호/로그인 알림 메일이 외부 LLM API로 전송되는 것을 막는 안전장치입니다.

## 분류 규칙 우선순위

```
SECURITY → PAYMENT → WORK → ANNOUNCEMENT → REPORT → PROMOTION → NEWSLETTER → OTHER(→ LLM 보조, 설정 시)
```

| 카테고리 (화면 표시명) | 예시 신호 |
|---|---|
| 보안 | 인증번호, 인증코드, 로그인 알림, 비밀번호 재설정, 보안 알림, OTP |
| 영수증 (내부 id: `payment`) | 결제, 영수증, 청구서, 주문확인, invoice, receipt, stripe/paypal/toss 발신자 |
| 업무 | 회의, 미팅, pull request, calendar invite, github/jira/slack 발신자 |
| 공고 (내부 id: `announcement`) | 입사지원, 신입, 공고, 사람인/인크루트 발신자 |
| 보고서 및 간행물 (내부 id: `report`) | seoul.go.kr, nabo.go.kr 등 공공기관/연구기관 발신자 |
| 프로모션 | 할인, 세일, 쿠폰, sale, coupon, free shipping |
| 오늘의 소식 (내부 id: `newsletter`) | 뉴스레터, 구독, digest, `List-Unsubscribe` 헤더 존재 |
| 기타 | 위 규칙에 안 걸리는 나머지 (LLM 보조 분류 대상) |

첫 화면(전체 탭)에서는 **오늘의 소식 / 공고 / 업무 / 영수증**이 큰 섹션으로, 나머지(보안/프로모션/보고서 및 간행물/기타)는 하단 작은 요약 리스트로 표시됩니다.

분류 규칙은 `backend/app/classifier.py`에서 키워드를 추가/수정할 수 있습니다.

## 테스트

```bash
cd backend
pytest
```

## 디렉터리 구조

```
backend/
  app/
    main.py          FastAPI 앱 + API 라우트 + 프론트엔드 정적 서빙
    classifier.py    규칙 기반 분류 + Claude API 보조 분류
    gmail_client.py  Gmail API 연동 (메일 조회, 라벨 생성/적용)
    schemas.py       데이터 모델 (카테고리, 이메일, 분류 결과)
    sample_data.py   데모용 샘플 이메일
    config.py        환경 설정 (.env)
  scripts/
    gmail_auth.py    최초 1회 Gmail OAuth 인증 스크립트
  tests/
    test_classifier.py
frontend/
  index.html / styles.css / app.js   카테고리 필터, 통계, 수동 정정이 가능한 대시보드
```
