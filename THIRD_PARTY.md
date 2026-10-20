# 의존성과 라이선스

런타임:

| 라이브러리 | 용도 | 라이선스 |
|---|---|---|
| [decimal.js 10.6.0](https://github.com/MikeMcl/decimal.js) | 십진 금액 계산 | MIT |
| [Papa Parse 5.5.3](https://github.com/mholt/PapaParse) | CSV/TSV | MIT |
| [ExcelJS 4.4.0](https://github.com/exceljs/exceljs) | XLSX 읽기 | MIT |

개발·검증: TypeScript, Vite, esbuild, Vitest, fast-check, Playwright, tsx.
비교 실험: daff, csv-diff, TabularDelta. 비교 도구의 코드를 새 도구라고 재배포하지 않는다.

정확한 의존성 트리는 `package-lock.json`에 고정된다. ExcelJS가 사용하는 UUID는
알려진 취약점 회피를 위해 11.1.1로 고정했고 XLSX 읽기 테스트로 호환성을 확인했다.
빌드 파일에는 번들러가 보존한 해당 라이브러리의 저작권·라이선스 주석이 포함된다.

ALIO 예제의 사실값은 원 기관의 공개 공시에서 발췌했다. 이 소프트웨어의 MIT 라이선스가
외부 원문 전체에 대한 권리를 새로 부여하는 것은 아니다.
