# Sephora 표준 스키마 v1

> 모든 라이브 크롤러 / 텍스트 임포터 결과는 영속화 직전에 `server/sephoraSchema.mjs`의
> `standardizeProduct(...)`를 통과합니다. 이 문서는 그 결과 객체의 계약(contract)을
> 정의합니다. 프론트엔드 / 분석 / 알림은 이 스키마에만 의존합니다.

`schemaVersion: 2` (현재 영속화 버전. 메타 필드도 DB에 저장됩니다.)

---

## 1. 필수 필드 (Required)

상품이 "표준화 통과"로 간주되려면 다음 7개 필드가 모두 비어있지 않아야 합니다.
누락 시 `warnings` 배열에 `missing:<field>` 항목이 추가되고 `qualityScore`가 떨어집니다.
저장은 그대로 진행되지만 운영 시 알림과 모니터링 대상이 됩니다.

| 필드             | 타입                 | 정규화 규칙                                                                       |
| ---------------- | -------------------- | --------------------------------------------------------------------------------- |
| `sourceItemId`   | `string`             | trim, HTML/엔티티 제거. **upsert 키.**                                            |
| `name`           | `string`             | HTML 태그 제거 → 엔티티 디코드 → 스마트따옴표 정규화 → 공백 정리.                 |
| `brand`          | `string`             | `name`과 동일한 텍스트 정제.                                                      |
| `priceAmount`    | `number`             | 음수/NaN 거부. 소수점 둘째 자리 반올림. 단위는 USD.                               |
| `ratingValue`    | `number`             | 0–5 범위 외/NaN은 `null`. 소수점 첫째 자리.                                       |
| `reviewCount`    | `integer`            | 음수/NaN은 `null`. 정수 반올림.                                                   |
| `size`           | `string`             | 정제된 원문(예: `1.7 oz / 50 ml`). 파생 값은 `sizeMl`, `sizeOz` 참고.             |

---

## 2. 선택/확장 필드

| 필드                        | 타입                                  | 비고                                                                  |
| --------------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| `source`                    | `string`                              | 기본 `'sephora'`.                                                     |
| `sourceUrl`                 | `string \| null`                      | 정제된 URL. http/https만 허용.                                        |
| `priceCurrency`             | `string \| null`                      | `priceAmount`가 있을 때 기본값 `'USD'`.                               |
| `priceMinAmount` / `priceMaxAmount` | `number \| null`              | 가격 범위 표기일 때 사용.                                             |
| `autoReplenishPriceAmount`  | `number \| null`                      | Auto-Replenish 할인가.                                                |
| `lovesCount`                | `integer \| null`                     | 0 이상.                                                               |
| `questionCount`             | `integer \| null`                     | 0 이상.                                                               |
| `recommendedPercent`        | `integer \| null`                     | 0–100.                                                                |
| `sizeMl` / `sizeOz`         | `number \| null`                      | `size`에서 파생. 단위 통일을 위해 ml/oz 둘 다 추출 시도.              |
| `formulation`               | `string \| null`                      | Cream / Gel / Lotion 등.                                              |
| `exclusiveLabel`            | `string \| null`                      | "Only at Sephora" 등.                                                 |
| `whatItIs` / `whatElse`     | `string \| null`                      | 요약 설명.                                                            |
| `cleanAtSephora`            | `string \| null`                      | Clean at Sephora 표기.                                                |
| `ingredientsText`           | `string \| null`                      | 원문 INCI 블록.                                                       |
| `inciIngredients`           | `string[]`                            | 콤마 분해 + trim + dedupe (최대 200).                                 |
| `skinTypes`                 | `string[]`                            | trim + dedupe (최대 50).                                              |
| `skincareConcerns`          | `string[]`                            | trim + dedupe (최대 50).                                              |
| `highlights`                | `string[]`                            | trim + dedupe (최대 50).                                              |
| `imageLabels`               | `string[]`                            | "Image 1" 같은 라벨.                                                  |
| `imageUrls`                 | `string[]`                            | http(s)만 허용, dedupe (최대 12). 프로토콜 없는 `//`는 `https:`로 보정. |
| `highlightedIngredients`    | `Array<{ name, description }>`        | name 기준 dedupe (최대 12).                                           |
| `ingredientCallouts`        | `string[]`                            | trim + dedupe.                                                        |
| `clinicalResults`           | `Array<{ name, description }>`        | name 기준 dedupe (최대 30).                                           |
| `prosMentioned` / `consMentioned` | `Array<{ label, count }>`       | 0 이상의 정수 count, label 기준 dedupe.                               |
| `rawText`                   | `string`                              | 텍스트 임포터 원문. 라이브 크롤러는 빈 문자열.                        |
| `crawledAt`                 | `string` (ISO-8601)                   | 누락 시 표준화 시점으로 채움.                                         |

---

## 3. 메타 필드 (표준화가 자동 추가)

| 필드             | 타입                  | 의미                                                                              |
| ---------------- | --------------------- | --------------------------------------------------------------------------------- |
| `schemaVersion`  | `1`                   | 마이그레이션 시 분기 키.                                                          |
| `qualityScore`   | `0–100`               | 가중치 기반(필수 필드 위주). 90+ 권장.                                            |
| `warnings`       | `string[]`            | `missing:<field>` 형태로 누락된 필수 필드를 표기.                                 |
| `sizeMl` / `sizeOz` | `number \| null`   | `size` 원문에서 파생 단위.                                                        |

> v2부터 메타 필드(`schemaVersion`, `qualityScore`, `warnings`, `sizeMl`, `sizeOz`)는
> `ImportedProduct` 테이블에 영속화됩니다. 기존 row는
> `pnpm db:backfill:sephora`로 일괄 재표준화/백필하세요.

---

## 4. 정규화 공통 규칙

- **HTML 제거**: 모든 문자열 필드에서 `<...>` 태그 제거.
- **엔티티 디코드**: `&amp; &quot; &#39; &lt; &gt; &nbsp; &apos;` 처리.
- **스마트따옴표**: `' ' " "` → `' ' " "` (예: `Kiehl's` 일관화).
- **공백 정규화**: `\s+` → 단일 공백, 양 끝 trim.
- **빈 값 → null**: 정제 후 빈 문자열은 항상 `null`로 저장.
- **배열 dedupe**: 문자열 기준 동일성으로 중복 제거 (대소문자는 named items에서만 무시).
- **이미지 URL**: `http://`, `https://`만 허용. `//cdn.example/x.jpg`는 `https:`로 보정.
- **사이즈**: 정규식으로 `ml`, `oz`(`fl oz` 포함) 추출. 둘 다 비어있으면 `sizeMl/sizeOz=null`이지만 원문 `size`는 보존.
- **가격**: 음수/NaN 거부, 소수점 둘째 자리 반올림. `priceCurrency` 미지정 시 기본 `USD`.
- **평점**: 0–5 외 값 또는 NaN은 `null`.

---

## 5. 멱등성 (Idempotency)

`standardizeProduct`는 **idempotent** 합니다. 이미 표준화된 객체를 다시 통과시켜도
구조와 값이 보존되어야 합니다(`server/sephoraSchema.test.mjs` 참고). 백필
(re-standardization) 작업이 안전합니다.

---

## 6. 실패 알림 기준

`server/crawlerAlerts.mjs`가 매 실행 종료 시 다음 조건을 평가합니다.
조건이 맞으면 `console.warn`/`console.error` + 옵션으로 Slack/Discord 호환
webhook(`SEPHORA_ALERT_WEBHOOK_URL`)로 통보합니다.

| 알림 종류                | 조건                                                                                       | 심각도               |
| ------------------------ | ------------------------------------------------------------------------------------------ | -------------------- |
| `high_failure_rate`      | 실행 처리량 ≥ 3 이고 실패율 ≥ 50%                                                          | warning (≥80% critical) |
| `consecutive_failures`   | 최근 실행 이력에서 연속 `failed` 상태 ≥ 2회                                                | warning (≥3회 critical) |
| `bot_blocking`           | 활성 타깃 ≥ 3 이고 `lastStatus = 'bot_challenge'` 비율 ≥ 30%                               | critical             |
| `stale_targets`          | 활성 타깃 중 `lastCrawledAt`이 7일 이상 지났거나 비어있는 항목이 1개 이상                  | warning              |

운영 권장:

- Slack incoming webhook URL을 Render 환경변수 `SEPHORA_ALERT_WEBHOOK_URL`에 등록.
- 매 실행 결과에서 `lowQuality`(=warnings 보유 상품 수)도 함께 모니터링.
- 7일 이상 stale 타깃은 수동으로 비활성화하거나 fetcher를 점검.

---

## 7. 운영 체크리스트

수집 성공률을 90%+로 유지하기 위한 정기 점검:

1. **타깃별 모니터링**: `GET /api/admin/sephora/targets`에서 `lastStatus` / `lastError` 확인.
2. **실행 이력**: `GET /api/admin/sephora/runs`로 최근 실행 결과/실패율 확인.
3. **봇 차단 시**: `SEPHORA_FETCHER=playwright`로 전환, 필요 시 residential proxy 도입.
4. **품질 점수**: 신규 타깃 추가 후 `qualityScore < 60`인 항목은 정제 함수 보강 검토.
5. **저장소 마이그레이션**: `schemaVersion` 필드를 기준으로 v1 → v2 백필 가능.

---

## 8. 참고

- 구현: `server/sephoraSchema.mjs`
- 알림: `server/crawlerAlerts.mjs`
- 통합: `server/sephoraRunner.mjs`, `server/index.mjs`(`/api/admin/import/sephora-text`)
- 테스트: `server/sephoraSchema.test.mjs`, `server/crawlerAlerts.test.mjs`
