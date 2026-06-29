# 디버깅 내역

실제 운영 중 발견된 버그와 수정 내역을 기록한다. 형식: 증상 → 원인 분석 → 수정 → 검증.

---

## 2026-06-29 — 대량 메일에 라벨 적용 시 2~3건이 간헐적으로 누락됨

### 증상

실제 Gmail 계정에서 조회 건수를 "전체"로 설정하고 "Gmail에 라벨 적용"을 체크해
"분류 실행"을 누르면 대부분 정상 동작하지만, 메일 수가 많을 때(수백~수천 건)
간혹 2~3건 정도는 Gmail에 라벨이 붙지 않는 현상이 보고됐다. 대시보드 자체는
오류 없이 정상적으로 결과를 보여줘서, 사용자 입장에서는 원인을 알기 어려웠다.

### 원인 분석

`backend/app/gmail_client.py`의 `apply_labels_batch()`는 라벨 적용 요청을
Gmail batch API로 한 번에 최대 100건씩 묶어 보낸다. Gmail API는 사용자별로
초당 처리 가능한 요청(쿼터) 한도가 있는데, batch로 100건을 거의 동시에
보내면 그중 일부가 일시적으로 `429`(요청 과다) 또는 `5xx` 오류로 실패할 수
있다 — 이는 라벨이 새로 생성되어 전파 지연이 있는 경우(`labelId not found`,
이미 수정됨)와는 별개의, 순수한 트래픽 버스트 문제다.

기존 코드는 실패한 건만 모아 0.5초 간격으로 **고정 간격** 3회까지만
재시도했는데, 쿼터가 빡빡하게 찬 상태에서는 0.5초로는 충분히 회복되지 않아
같은 메일이 3번 모두 실패할 수 있었다. 게다가 3회를 모두 실패하면
`RuntimeError`를 던져 `/api/classify` 요청 전체를 500으로 실패시키도록
되어 있었는데, 그 시점에는 이미 대부분의 batch 호출이 성공적으로 실행되어
Gmail 쪽에는 라벨이 거의 다 적용된 상태였다 — 즉 "거의 다 됐는데 마지막에
예외가 나서 응답만 실패"하는 상황이라, 사용자에게는 오류 배너 없이 그냥
"몇 개가 빠진 것처럼" 보일 수 있었다(직전 성공 화면이 그대로 남아 있는
경우 등).

### 수정

`backend/app/gmail_client.py`의 `apply_labels_batch()`:

1. 재시도 간격을 고정 0.5초에서 **지수 백오프**(0.5s → 1s → 2s → 4s → 4s,
   최대 5회)로 변경해 쿼터가 회복될 시간을 더 확보했다.
2. 모든 재시도 후에도 실패하는 메일이 있어도 더 이상 예외를 던지지 않고,
   **끝까지 실패한 메일 ID 목록을 반환**하도록 변경했다. 이미 성공한
   나머지 메일들의 라벨 적용 결과를 보존하고, 호출자가 부분 실패를 알 수
   있게 했다.

`backend/app/main.py`의 `/api/classify`: 반환된 실패 목록의 길이를
`label_apply_failures`로 응답에 포함.

`frontend/app.js`의 `runClassify()`: `label_apply_failures > 0`이면
분류 결과는 정상적으로 화면에 반영하면서, 오류 배너에 "n건은 라벨 적용에
실패했으니 다시 시도해보라"는 안내를 비침투적으로(전체 실패 처리 없이)
보여주도록 추가.

### 검증

- `cd backend && pytest -q` — 기존 7개 테스트 모두 통과(분류 로직 비변경).
- 실 Gmail 대량 계정으로의 재현·재검증은 사용자 환경에서 필요 — 코드
  리뷰 기준으로는 batch API의 알려진 버스트 레이트리밋 패턴에 대한 표준
  대응(지수 백오프 + 부분 실패 허용)이다.

### 참고

- 라벨 생성 직후 전파 지연 문제(`labelId not found`)는 `ensure_label()`이
  라벨을 실제로 쓸 수 있는지 미리 확인하므로 `apply_labels_batch()` 시점에는
  이미 해소된 상태다 — 이번 건은 그와 별개로 대량 요청 자체의 쿼터 버스트가
  원인이다.
- 그래도 끝까지 실패하는 메일이 있다면, 사용자가 안내 메시지를 보고
  "분류 실행"을 다시 눌러 재시도하면 해당 메일들도 보통 해소된다(이미 라벨이
  붙은 메일은 같은 라벨을 다시 추가해도 멱등이라 안전).

---

## 2026-06-29 — Gmail 라벨 적용 시 `labelId not found` 오류

### 증상

실제 Gmail 계정을 OAuth로 연결한 뒤, 대시보드에서 소스를 "Gmail"로 전환하고
"분류 실행"(라벨 적용 포함)을 누르면 다음 오류로 요청이 실패했다.

```
File ".../googleapiclient/http.py", line 938, in execute
    raise HttpError(resp, content, uri=self.uri)
googleapiclient.errors.HttpError: <HttpError 400 when requesting
https://gmail.googleapis.com/gmail/v1/users/me/messages/19f11e467dbfd90a/modify?alt=json
returned "labelId not found". Details: "[{'message': 'labelId not found',
'domain': 'global', 'reason': 'invalidArgument'}]">
```

데모 모드(`source=demo`)에서는 재현되지 않았고, 실제 Gmail 계정으로 라벨을
**새로 생성**하는 첫 실행에서만 발생했다.

### 원인 분석

`backend/app/main.py`의 `/api/classify` 핸들러는 카테고리별로 Gmail 라벨이
없으면 `ensure_label()`로 생성하고, 곧바로 그 라벨 ID로 `apply_label()`을
호출해 메일에 라벨을 붙인다.

```python
if cat_value not in label_id_by_category:
    label_id_by_category[cat_value] = ensure_label(cat_value)
apply_label(item.email.id, label_id_by_category[cat_value])
```

문제는 `ensure_label()`(`backend/app/gmail_client.py`)이 `labels().create()`
호출이 성공(200)하자마자 반환된 `id`를 그대로 신뢰하고 돌려준다는 점이었다.

Gmail API는 라벨을 **생성한 직후 그 ID가 곧바로 다른 API(메일 `modify`)에서
사용 가능하다고 보장하지 않는다** — 서버 쪽 전파(propagation) 지연이 있어,
생성 응답은 받았지만 같은 요청 내에서 바로 그 라벨로 `messages.modify`를
호출하면 일시적으로 `labelId not found (400, invalidArgument)`가 발생할 수
있다. 기존 코드에는 이 지연을 흡수하는 재시도/대기 로직이 전혀 없었다.

(이미 존재하는 라벨을 재사용하는 경로는 `labels().list()`로 조회한 뒤라
이 문제와 무관하다 — 새로 만든 라벨을 즉시 쓸 때만 재현된다.)

### 수정

`backend/app/gmail_client.py`:

1. `ensure_label()`에서 라벨 생성 직후, `_wait_until_label_usable()`을 호출해
   해당 라벨이 실제로 `labels().get()`으로 조회 가능해질 때까지 짧게(0.5초
   간격, 최대 5회) 재확인하도록 했다.
2. `apply_label()`에도 안전망으로, `400` 오류 발생 시 최대 2회까지 0.5초
   간격으로 재시도하는 로직을 추가했다.

```python
def _wait_until_label_usable(service, label_id: str, attempts: int = 5, delay: float = 0.5) -> None:
    from googleapiclient.errors import HttpError
    for _ in range(attempts):
        try:
            service.users().labels().get(userId="me", id=label_id).execute()
            return
        except HttpError:
            time.sleep(delay)
```

### 검증

- `cd backend && pytest -q` — 기존 7개 테스트 모두 통과 (분류 로직 비변경 확인).
- 실제 Gmail 계정으로 재현 테스트는 사용자 환경에서 재시도 요청 — 코드 리뷰
  기준으로는 Gmail API의 알려진 전파 지연 현상에 대한 표준적인 대응(폴링
  재시도)이며, 동일 요청 흐름 안에서 발생할 수 있는 경쟁 조건을 제거한다.
- 커밋: `Gmail 라벨 생성 직후 적용 시 발생하는 labelId not found 오류 수정`
  (브랜치 `claude/email-auto-categorization-ccab9j`).

### 참고

- 이미 생성된 라벨이 Gmail 웹 UI에서 수동으로 삭제된 뒤 같은 이름으로 다시
  쓰려는 경우에도 동일한 재시도 로직이 적용되어 안전하다.
- 근본적으로 더 안전하게 하려면 `apply_label` 실패 시 호출자(`main.py`)가
  부분 실패를 사용자에게 알리는 처리도 고려할 수 있으나, 현재는 예외를 그대로
  올려 FastAPI 기본 500 응답으로 노출된다 (추후 보완 후보).

---

## 2026-06-29 — 조회 건수 드롭다운을 바꿔도 적용되지 않음

### 증상

화면 상단에 조회 건수(20/50/100/500/전체) 드롭다운을 추가했는데, 사용자가
값을 바꿔도 실제 조회 결과에는 반영되지 않는 것처럼 보였다.

### 원인 분석

Playwright로 실제 전송되는 `/api/classify` 요청 바디를 가로채 확인해보니,
**"분류 실행" 버튼을 클릭했을 때는** `limit` 값이 정상적으로 바뀌어 전송되고
있었다 (`{"limit":20}` → 버튼 클릭 후 `{"limit":null}` 등). 즉 백엔드 연동
자체는 문제가 없었다.

진짜 원인은 `frontend/app.js` 하단의 이벤트 리스너 등록부에 있었다.
`source-select`는 `change` 시 라벨 적용 체크박스 상태만 갱신할 뿐 재조회를
하지 않고, `limit-select`에는 아예 `change` 리스너가 없었다 — 두 컨트롤
모두 값을 바꾸는 것만으로는 아무 일도 일어나지 않고, 오직 `refresh-btn`의
`click` 이벤트만 `runClassify()`를 호출하도록 되어 있었다.

```js
sourceSelect.addEventListener("change", () => { ... }); // 재조회 없음
refreshBtn.addEventListener("click", runClassify);        // 버튼을 눌러야만 재조회
```

즉 드롭다운에서 "전체"를 선택한 것만으로는 아무 요청도 나가지 않고, 그
직후에 "분류 실행"을 눌러야만 비로소 반영되는 구조였다 — 사용자 입장에서는
"드롭다운이 있는데 적용이 안 된다"로 보일 수밖에 없었다.

(부가적으로, 데모 데이터는 샘플이 12건뿐이라 어떤 값을 선택해도 항상 12건이
나오므로 데모 모드로 테스트하면 더더욱 "적용 안 됨"처럼 보인다.)

### 수정

`frontend/app.js`에 `limit-select`의 `change` 이벤트에서 바로
`runClassify()`를 호출하도록 추가했다.

```js
limitSelect.addEventListener("change", runClassify);
```

### 검증

- Playwright로 버튼 클릭 없이 `#limit-select`만 `"all"`로 바꾼 뒤
  `/api/classify` 요청이 자동으로 발생하는지 확인 — 변경 전엔 요청이 전혀
  나가지 않았고, 변경 후엔 `{"source":"demo","limit":null,...}` 요청이 즉시
  발생함을 확인.
- `cd backend && pytest -q` — 기존 7개 테스트 모두 통과(백엔드 비변경).
- 커밋: `조회 건수 드롭다운 선택 시 분류 실행 버튼 없이 즉시 재조회되도록 수정`
  (브랜치 `claude/email-auto-categorization-ccab9j`).

### 참고

- `source-select`는 의도적으로 그대로 두었다(소스 전환 시 라벨 적용 체크박스
  상태를 같이 바꿔야 해서, 자동 재조회를 붙이면 의도치 않게 Gmail 라벨이
  적용된 상태로 곧바로 분류가 실행될 수 있음). 소스 전환은 여전히 "분류
  실행" 버튼을 눌러야 한다.
