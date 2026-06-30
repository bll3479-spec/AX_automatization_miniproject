---
title: '자봐 분류 규칙 보강 (오분류 케이스 기반 키워드/발신자 확장)'
status: draft
created: '2026-06-30'
updated: '2026-06-30'
---

# Product Brief: 자봐 분류 규칙 보강

## Executive Summary

자봐는 규칙 기반(키워드+발신자) 1차 분류 위에 애매한 메일만 LLM로 보조 분류하는 구조다. 사용자가 자신의 실제 Gmail 계정으로 자봐를 테스트하며 두 가지 오분류 패턴을 발견했고, 이번 조사로 같은 구조적 원인에서 비롯된 세 번째(역방향) 사례까지 실제 메일함에서 확인했다. 모든 사례는 `classifier.py`의 키워드/발신자 리스트가 비어있거나 부실한 지점에서 발생한다. 이번 브리프는 분류 로직(점수 계산 방식)은 그대로 두고, 키워드·발신자 리스트만 확장해 오분류를 줄이는 작업의 범위를 정의한다.

## The Problem

`classify_email()`은 카테고리별로 `score = 키워드 매칭 수 + 발신자 매칭 수 * 2`를 계산해 가장 높은 점수의 카테고리를 선택한다(`backend/app/classifier.py:99-111`). 이 경쟁 구조에서 다음 세 가지 실제 오분류가 확인됐다.

1. **PROMOTION → PAYMENT 오분류** (사용자 최초 보고): 본문에 "지금 결제하시면 ~~한 가격에..." 같은 결제 유도 문구가 섞인 광고/뉴스레터 메일이 PAYMENT 키워드("결제")에 걸려 PAYMENT로 분류됨.
2. **NEWSLETTER가 PAYMENT를 가림** (사용자 최초 보고): 본문에 "결제" 키워드가 있어도 List-Unsubscribe 헤더 보너스(+2)와 NEWSLETTER 발신자 패턴(`news@` 등)이 누적되면 PAYMENT 점수를 넘어서 NEWSLETTER로 분류됨.
3. **PAYMENT → PROMOTION 오분류 (역방향, 이번 조사로 신규 확인)**: 실제 수신한 쿠팡 정기결제 영수증 메일(`no_reply@coupang.com`, "와우 멤버십 월회비가 결제되었습니다")이 본문 내 마케팅 푸터("할인", "무료배송")로 인해 PAYMENT 키워드 1점 < PROMOTION 키워드 2점이 되어 PROMOTION으로 분류됨. PAYMENT_SENDERS에 쿠팡 패턴이 없고, 이 발신자는 결제 메일과 프로모션 메일을 같은 주소로 함께 보내 발신자 기반 룰만으로는 완전히 해소되지 않는다.

**구조적 공통 원인**: `_RULE_TABLE`(`classifier.py:62-68`)에서 PROMOTION만 유일하게 발신자 패턴 리스트가 비어있다(`(Category.PROMOTION, PROMOTION_KEYWORDS, [])`). PAYMENT/WORK/ANNOUNCEMENT/NEWSLETTER는 모두 `*_SENDERS` 리스트가 있어 발신자 신호로 키워드 점수를 보강할 수 있지만, PROMOTION은 그 보강 수단이 없다 — 그 결과 PROMOTION이 이겨야 할 때(사례 3에서는 반대로) 점수 경쟁이 불안정해진다.

## The Solution

분류 알고리즘(점수 계산 방식)은 변경하지 않고, 다음 리스트만 확장한다.

- **`PROMOTION_SENDERS` 신설**: 현재 빈 리스트(`[]`)에 실제 관찰된 발신자 패턴을 추가한다. 이번 조사에서 `promos@wellness.iherb.com`이라는 실제 수신 메일로 사용자의 가설("발신자 아이디에 promo~가 있으면 프로모션")이 확인됐다 — `_matched_senders()`(`classifier.py:79-81`)는 부분 문자열 포함 매칭이므로 `"promo"` 패턴 하나만 추가해도 즉시 적용된다. 발신자 매칭은 가중치가 2배(`sender_hits * 2`)이므로, 키워드 1~2개로 근소하게 흔들리는 현재의 약한 판정을 확실하게 굳혀준다.
- **사례별 키워드/발신자 보강**: 사용자 검토를 거쳐 사례 1·2·3에서 드러난 패턴(쿠팡류 정기결제 발신자, 광고성 결제 유도 문구 등)을 적절한 리스트에 추가한다.
- **테스트 보강**: `tests/test_classifier.py`에 이번에 발견된 3개 실사례를 회귀 테스트로 추가한다.

## Who This Serves

- 자봐를 자신의 Gmail 계정에 연동해 쓰는 1인 사용자(브리프 작성 시점 기준 실사용자 본인) — 분류 정확도가 곧 대시보드 신뢰도로 직결된다.

## Scope

**In:**
- `PROMOTION_SENDERS` 신설 및 `_RULE_TABLE`에 반영
- 사례 1·2·3에서 확인된 키워드/발신자 패턴을 해당 리스트(PAYMENT/PROMOTION/NEWSLETTER 등)에 추가
- `test_classifier.py`에 3개 실사례 기반 회귀 테스트 추가

**Out (이번 범위 아님):**
- 점수 계산 방식(가중치, List-Unsubscribe 보너스 로직 등) 변경 — 사용자가 "점수 계산 방식은 고려해볼게"로 보류함
- LLM 폴백 로직 변경
- 신규 카테고리 추가
- SECURITY 이중 가드 변경 (절대 손대지 않음)

## Success Criteria

- 사용자가 보고한 사례 1·2와 이번 조사로 확인한 사례 3이 모두 올바른 카테고리로 분류됨
- 기존 `test_classifier.py` 7개 테스트 회귀 없이 통과
- 추가된 회귀 테스트(신규 사례 3건) 통과

## Known Limitations / Open Questions

- **쿠팡류 사례(사례 3)는 발신자 룰만으로 근본 해결이 어려움**: 같은 발신자가 결제 메일과 순수 프로모션 메일을 둘 다 보내기 때문에, 발신자 패턴을 PAYMENT 쪽에 추가하면 진짜 프로모션 메일이 PAYMENT로 오분류될 위험이 생긴다. 이번 범위에서는 키워드 보강(예: "정기 결제", "멤버십" 등 PAYMENT 키워드 강화)으로 완화를 시도하되, 근본 해결에는 점수 계산 방식 개선(예: 키워드 종류별 가중치 차등)이 필요할 수 있어 다음 라운드 검토 항목으로 남긴다.
- **"마감" 키워드 충돌 가능성**: WORK_KEYWORDS의 "마감"(업무 마감)이 프로모션 카피("세일 마감임박")에도 흔히 등장한다. 현재 조사한 사례(`promos@wellness.iherb.com`)에서는 PROMOTION 키워드가 더 많아 문제가 드러나지 않았지만, PROMOTION 키워드가 1개뿐인 메일에서는 WORK로 잘못 끌려갈 수 있다 — 향후 모니터링 대상으로 기록.
