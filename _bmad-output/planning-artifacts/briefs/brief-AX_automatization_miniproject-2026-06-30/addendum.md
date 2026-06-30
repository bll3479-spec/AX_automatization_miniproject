# Addendum: 오분류 사례 원본 증거 및 점수 계산

브리프 본문의 "The Problem"에서 요약한 3가지 사례의 원본 데이터와 수동 점수 계산. 다운스트림(PRD/구현) 작업 시 정확한 키워드/발신자 후보를 정할 때 참조. 사례 번호는 브리프 본문의 사례 1·2·3과 동일하게 맞춤.

## 사례 1 검증 — 사용자 가설(promo~ 발신자) 확인

**원본 메일** (thread id `19f16470124eabc1`)

- 발신자: `promos@wellness.iherb.com` ← 사용자가 가설로 제시한 "promo~" 패턴과 정확히 일치
- 제목: `라스트 찬스! 2개 구매 시 1개 80% 할인`
- 스니펫: "역대급 세일 곧 마감! 지금 여행 필수템 2개 구매하면 1개 80% 초특가 할인 적용 중!"

**현재 점수 계산**:
- PROMOTION: 키워드 매칭 = `["세일", "할인"]` → 2점, 발신자 0점(리스트 비어있음). **총 2점**
- WORK: 키워드 매칭 = `["마감"]` → 1점. **총 1점**
- 현재는 PROMOTION(2) > WORK(1)로 우연히 올바르게 분류되지만, 마진이 1점뿐이라 PROMOTION 키워드가 1개만 매칭되는 유사 메일에서는 WORK로 잘못 분류될 수 있음(브리프 "Known Limitations"의 "마감" 충돌 항목 참고).
- `PROMOTION_SENDERS`에 `"promo"`를 추가하면: PROMOTION 발신자 매칭 1개 × 2 = +2점 → **총 4점**으로 마진이 안정적으로 확보됨.

## 사례 2 — List-Unsubscribe 메커니즘 정상 동작 확인 (버그 아님, 참고용)

검색어 `결제 (구독 OR 뉴스레터 OR unsubscribe OR "구독 해지")`로 조회된 메일 중 다수가 `neusral.news@neusral.com`(실제 뉴스레터, 헤드라인 중 하나에 "결제" 단어가 우연히 포함)였다. 이 발신자는 `NEWSLETTER_SENDERS`의 `"news@"` 패턴과 매칭되고(`neusral.news@neusral.com` 안에 `news@` 부분 문자열 포함) List-Unsubscribe 헤더도 있어 NEWSLETTER 점수가 압도적으로 높다 — 이는 사용자가 보고한 "결제 키워드가 있어도 List-Unsubscribe 때문에 뉴스레터로 분류" 현상의 정상적인 사례이며 진짜 결제 메일은 아니었다.

**참고(미확인 리스크, 증거 아님)**: 진짜 결제 영수증 메일이 우연히 List-Unsubscribe 헤더를 갖는 경우(예: 마케팅 동의 푸터가 붙은 영수증)는 이번 조사에서 실제로 발견되지 못했다 — 사례 1·3과 달리 실증된 사례가 아니라 이론적 가능성으로만 적어둔다. 향후 조사 시 확인 대상.

## 사례 3 — 신규 발견: PAYMENT → PROMOTION 역방향 오분류

**원본 메일** (Gmail MCP `search_threads`로 확인, thread id `19ef3643899d6385`)

- 발신자: `no_reply@coupang.com`
- 제목: `[쿠팡] 김*현님, 와우 멤버십 월회비가 결제되었습니다.`
- 스니펫: "coupang 와우 멤버십 월회비가 결제되었습니다 다양한 와우 혜택을 이용해보세요 로켓배송 무료배송 상품보기 오늘 도착 ・ 새벽 도착 상품보기 로켓프레시 구매 가능 상품보기 와우 전용 추가 할인 상품보기 쿠팡플레이 특별 혜택 바로가기 쿠팡이츠 배달비 0원 바로가기 와우회원은 이런 혜택도 누려요 로켓배송 30일 무료반품 로켓직구 무료배송 로켓럭셔리 와우 혜택"

**수동 점수 계산** (`classify_email()` 로직 기준):
- PAYMENT: 키워드 매칭 = `["결제"]` → 1점. 발신자 매칭 = 없음(`PAYMENT_SENDERS`에 쿠팡 패턴 없음) → 0점. **총 1점**
- PROMOTION: 키워드 매칭 = `["할인", "무료배송"]` → 2점. 발신자 매칭 = 0(`PROMOTION_SENDERS`가 현재 빈 리스트). **총 2점**
- 결과: PROMOTION(2) > PAYMENT(1) → **PROMOTION으로 오분류** (실제로는 결제 영수증 메일)

## 조사 방법

Gmail MCP 서버(`mcp__Gmail__search_threads`)로 사용자의 실제 인증된 Gmail 계정을 대상으로 다음 쿼리를 실행:
1. `subject:(결제) (할인 OR 쿠폰 OR 이벤트 OR 무료배송 OR 세일 OR 특가)` — PAYMENT/PROMOTION 혼재 사례 탐색
2. `결제 (구독 OR 뉴스레터 OR unsubscribe OR "구독 해지")` — PAYMENT/NEWSLETTER 혼재 사례 탐색
3. `from:promo` — 사용자 가설(promo~ 발신자) 직접 검증
4. `(마감 OR 공고 OR 채용) (할인 OR 이벤트 OR 쿠폰)` — WORK/ANNOUNCEMENT/PROMOTION 혼재 사례 탐색 (인크루트 채용 공고 메일은 `ANNOUNCEMENT_SENDERS`의 `"incruit"` 패턴 매칭으로 이미 정상 분류됨을 확인 — 별도 이슈 없음)

자봐 앱 자체는 이 컨테이너에 Gmail OAuth 자격증명(`credentials.json`/`token.json`)이 없어 `source=gmail`로 직접 구동할 수 없었음 — 대신 세션에 연결된 Gmail MCP 도구로 동일한 실제 메일함 데이터를 조사하고, `classifier.py` 로직을 수동 적용해 검증했다.
