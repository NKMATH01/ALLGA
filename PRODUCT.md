# 올가 미수등 시스템

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

학생, 학부모, 지점장, 총괄 관리자가 역할별 화면을 사용한다. 근거: client/src/App.tsx, docs/nk-team-routine/profile.md.

## Product Purpose

입시 국어 학원의 시험 배포, 응시, 채점, 성적 조회와 AI 분석 보고서를 연결하는 관리 프로그램이다.

## Operating Context

지점장은 학생과 반을 관리하고 시험을 배포하며 응시와 보고서를 확인한다. 학생은 시험에 응시하고 결과를 조회한다. 학부모는 연결된 자녀의 결과를 확인한다. 총괄 관리자는 지점과 시험을 관리한다. 데스크톱과 모바일 웹을 지원한다.

## Capabilities and Constraints

기존 React/Vite/Tailwind 클라이언트와 Express/Drizzle/PostgreSQL 서버를 사용한다. 성적 계산, 권한, 개인정보, 운영 DB는 보호 대상이다. 이번 요청은 로그인부터 역할별 전체 화면의 디자인 개편이다. 데이터와 기능은 기존 구현을 기준으로 유지한다.

## Brand Commitments

사용자는 2026-09-08 현재 디자인이 밋밋하고 고급스럽지 않다고 설명하고, 밝고 정돈된 프리미엄 업무 도구 분위기를 선택했다. 이름은 올가/ALLGA를 사용한다. 구체적인 색상과 서체는 아직 확정하지 않았다.

## Evidence on Hand

DESIGN.md, docs/nk-team-routine/log.md, client/src/pages/, design-migration/에 기존 구현과 작업 기록이 있다. 저장된 화면 캡처는 과거 상태이며 현재 화면의 증거로 간주하지 않는다.

## Product Principles

- 실제 성적과 상태를 정확하게 표현한다.
- 사용자가 해야 할 작업과 결과를 쉽게 찾도록 한다.
- 역할별 기능과 데이터 접근 경계를 유지한다.
- 모바일, 키보드 조작, 다크 모드에서 읽기와 조작을 지원한다.

## Open Decisions

인쇄용 AI 보고서 지면까지 이번 디자인 개편에 포함할지는 미확정이다. 기존 지면은 별도 템플릿으로 관리된다.
