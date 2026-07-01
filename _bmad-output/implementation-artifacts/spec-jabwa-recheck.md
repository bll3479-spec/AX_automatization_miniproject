---
title: '자봐 재점검 — 스테일 rawEmails 버그 + 기타 섹션 미리보기 + 문서 동기화'
type: 'bugfix'
created: '2026-07-01'
status: 'done'
baseline_commit: 'cea8d6aa99e086ec9128b4c8f102f59aa671a433'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** (1) 경쟁 조건 시 `state.rawEmails`가 `_classifyRun` 체크 이전에 스테일 값으로 덮어씌워져 "적용" 버튼이 화면과 다른 메일 배치를 재분류함. (2) 기타 알림 섹션의 카테고리 그룹이 `PAGE_SIZE=10`으로 페이지네이션되어 메인 섹션의 5건 미리보기와 불일치. (3) `project-context.md`에 `source-select` 자동 재조회를 "하지 않는다"고 기재되어 있으나 실제 코드는 `runClassify()` 호출하고 있어 문서-코드 불일치.

**Approach:** `runClassifyBatched()`가 `rawEmails`를 반환값으로 돌려주도록 변경해 `state.rawEmails`를 `_classifyRun` 검사 통과 후에만 갱신. 기타 그룹도 `HOME_SECTION_PREVIEW` 상수로 미리보기 제한 + "전체 N건 보기 →" 버튼 추가. `project-context.md` 해당 항목 현행화.

## Boundaries & Constraints

**Always:**
- `_classifyRun` 세대 카운터 로직은 변경하지 않음
- `applyPendingOverrides()`의 `classifyRawInBatches(state.rawEmails)` 호출부는 그대로 유지 — `state.rawEmails` 값이 올바르게 유지되면 충분
- 기타 알림 "전체 보기" 버튼 클릭 시 기존 `selectCategory(cat.id)`로 카테고리 리스트로 전환

**Ask First:**
- `HOME_SECTION_PREVIEW`(현재 5) 상수를 기타 섹션에도 동일하게 쓸지, 별도 상수(`MINOR_SECTION_PREVIEW`)를 둘지 → 별도 상수 불필요하면 그대로 재사용

**Never:**
- `PAGE_SIZE` 상수 변경 금지 (리스트 뷰 페이지네이션에 영향)
- Gmail API 호출 로직 변경 금지
- 기존 테스트 수정 금지

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 드롭다운 빠른 연속 변경 후 "적용" | `_classifyRun` 세대 불일치 상황, 스테일 fetch 완료 | `state.rawEmails`가 현재 UI 결과와 일치하는 rawEmails로만 갱신됨 | 스테일 요청은 조용히 return |
| 기타 그룹 ≤ 5건 | 카테고리당 메일 5건 이하 | "전체 보기" 버튼 없이 전체 표시 | — |
| 기타 그룹 > 5건 | 카테고리당 메일 6건 이상 | 첫 5건 + "전체 N건 보기 →" 버튼 | — |

</frozen-after-approval>

## Code Map

- `frontend/app.js:489-492` -- `runClassifyBatched()` — rawEmails를 직접 state에 쓰는 지점
- `frontend/app.js:494-549` -- `runClassify()` — `_classifyRun` 세대 검사 및 state 갱신
- `frontend/app.js:299-317` -- `renderMinorCategoryGroup()` — paginate() 사용 중
- `frontend/app.js:1` -- `HOME_SECTION_PREVIEW = 5` 상수
- `_bmad-output/project-context.md:71` -- source-select 자동 재조회 관련 오기재 항목

## Tasks & Acceptance

**Execution:**
- [x] `frontend/app.js` -- `runClassifyBatched()`를 `{ rawEmails, classified }` 반환으로 변경, `state.rawEmails` 갱신을 `runClassify()` 내부 `_classifyRun` 체크 이후로 이동 -- 스테일 rawEmails 덮어쓰기 방지
- [x] `frontend/app.js` -- `renderMinorCategoryGroup()`에서 `paginate()` 제거, `items.slice(0, HOME_SECTION_PREVIEW)` + "전체 N건 보기 →" 버튼 추가 -- 메인 섹션과 일관된 미리보기
- [x] `_bmad-output/project-context.md` -- `source-select` 자동 재조회 설명을 현재 코드(runClassify() 호출함)에 맞게 수정 -- 문서-코드 불일치 해소

**Acceptance Criteria:**
- Given 드롭다운을 "전체" → "20건"으로 빠르게 변경, when "전체" fetch가 늦게 완료, then `state.rawEmails`는 "20건" 결과로 유지되고 "적용" 클릭 시 20건 기준으로 재분류됨
- Given 기타 알림 섹션의 특정 카테고리에 10건 메일, when 홈 화면 렌더링, then 첫 5건만 표시되고 "전체 10건 보기 →" 버튼이 나타남
- Given "전체 N건 보기 →" 클릭, when 클릭, then 해당 카테고리 리스트 뷰로 전환됨
- Given 위 변경 완료, when `pytest -q`, then 22개 테스트 전체 통과

## Design Notes

`runClassifyBatched()` 반환값 변경 예시:
```js
async function runClassifyBatched(source, limit) {
  const rawEmails = await fetchRawEmails(source, limit);
  const classified = await classifyRawInBatches(rawEmails);
  return { rawEmails, classified };
}
// runClassify() 내부:
const { rawEmails, classified: newClassified } = await runClassifyBatched(source, limit);
// ... _classifyRun 체크 후 ...
state.rawEmails = rawEmails;
```

## Verification

**Commands:**
- `cd backend && source .venv/bin/activate && pytest -q` -- expected: 22 passed

**Manual checks:**
- 홈 화면에서 기타 알림 섹션의 카테고리 그룹이 최대 5건만 표시되는지 확인
- "전체 N건 보기 →" 버튼 클릭 시 해당 카테고리 리스트 뷰로 전환되는지 확인

## Suggested Review Order

**스테일 rawEmails 경쟁 조건 수정 (핵심 버그)**

- `runClassifyBatched()`를 순수 반환 함수로 전환해 호출자에게 state 갱신 책임 위임
  [`app.js:501`](../../frontend/app.js#L501)

- `_classifyRun` 검사 전 임시 보관 변수 선언 — 함수 스코프 전체에서 유효해야 함
  [`app.js:528`](../../frontend/app.js#L528)

- Gmail 라벨 적용 경로도 `pendingRawEmails` 패턴으로 통일 — 두 경로 일관성 확보
  [`app.js:547`](../../frontend/app.js#L547)

- 세대 검사 통과 후에만 `state.rawEmails` 갱신 — 이 한 줄이 경쟁 조건의 실질적 해결
  [`app.js:558`](../../frontend/app.js#L558)

**기타 알림 섹션 미리보기 제한**

- `paginate()` 제거 후 `HOME_SECTION_PREVIEW` 슬라이스로 교체 — 메인 섹션과 동일 패턴
  [`app.js:316`](../../frontend/app.js#L316)

- 5건 초과 시 카테고리 리스트 뷰로 이동하는 "전체 N건 보기 →" 버튼 조건부 렌더링
  [`app.js:320`](../../frontend/app.js#L320)

**문서 동기화**

- `source-select` 자동 재조회 설명을 실제 코드 동작(runClassify 호출함)에 맞게 수정
  [`project-context.md:71`](../project-context.md#L71)
