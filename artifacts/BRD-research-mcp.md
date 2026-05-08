# Business Requirements Document

---

| | |
|---|---|
| **Document Title** | AI Research Automation Platform — Business Requirements Document |
| **Project Code** | CGI-NIE-2026-AI-001 |
| **Client** | The Nielsen Company |
| **Prepared by** | CGI Inc. — Digital & AI Practice |
| **Document Owner** | CGI Engagement Manager |
| **Version** | 1.0 |
| **Status** | Draft for Client Review |
| **Date** | May 2026 |
| **Classification** | Confidential |

---

## Document Control

### Version History

| Version | Date | Author | Description of Changes |
|---------|------|--------|------------------------|
| 0.1 | April 2026 | CGI Digital & AI Practice | Initial draft for internal review |
| 0.2 | April 2026 | CGI Digital & AI Practice | Revised following stakeholder interviews |
| 1.0 | May 2026 | CGI Digital & AI Practice | Final version submitted to Nielsen for review |

### Distribution List

| Name | Role | Organisation | For |
|------|------|--------------|-----|
| TBD | VP Analytics | Nielsen | Approval |
| TBD | Director, Research Operations | Nielsen | Review & Approval |
| TBD | Engineering Lead | Nielsen | Review |
| TBD | Engagement Manager | CGI | Ownership |
| TBD | Solution Architect | CGI | Review |

### Approval

This document requires formal sign-off from the Nielsen Product Owner and CGI Engagement Manager before development begins. See Section 14.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Context](#2-business-context)
3. [Current State — As-Is](#3-current-state--as-is)
4. [Problem Statement](#4-problem-statement)
5. [Business Objectives](#5-business-objectives)
6. [Future State — To-Be](#6-future-state--to-be)
7. [Project Scope](#7-project-scope)
8. [Stakeholders](#8-stakeholders)
9. [Business Requirements](#9-business-requirements)
10. [Business Rules](#10-business-rules)
11. [Business Process Flows](#11-business-process-flows)
12. [Assumptions & Constraints](#12-assumptions--constraints)
13. [Dependencies](#13-dependencies)
14. [Success Criteria & Benefits Realisation](#14-success-criteria--benefits-realisation)
15. [Glossary](#15-glossary)
16. [Sign-Off](#16-sign-off)

---

## 1. Executive Summary

Nielsen's global research and analytics teams spend a significant and measurable portion of their working day on manual, low-value research tasks — reading articles, extracting entities, and cross-referencing sources — work that does not require human judgement but currently has no automated alternative.

CGI proposes to deliver the **Nielsen AI Research Automation Platform** (internally referred to as *research-mcp*): a production-ready AI service that automates four core research workflows. Analysts will be able to summarise web content, search and retrieve background information, extract named entities from documents, and compare competing sources — all through the tools they already use, including Claude Desktop and Nielsen's internal web portals.

This document captures the business requirements agreed between CGI and Nielsen. It defines what the business needs, why it needs it, and how success will be measured. Technical specifications, architecture decisions, and project estimation are documented separately in the Software Design Document (SDD) and Statement of Work (SOW).

**Engagement summary:** 10 weeks · CGI Digital & AI Practice · Phase 1 of a planned multi-phase AI research programme.

---

## 2. Business Context

### 2.1 About Nielsen

Nielsen is a global data and analytics company that measures and analyses consumer behaviour, media, and market dynamics across more than 55 countries. Nielsen's research and analytics teams produce proprietary reports, market intelligence, and advisory outputs for clients across media, FMCG, financial services, and technology sectors.

### 2.2 Nielsen's AI Strategy

Nielsen has committed to an organisation-wide AI adoption programme, with research automation identified as a high-priority workstream for 2026. The programme's goal is to augment — not replace — the expertise of senior analysts by automating the preparatory and administrative components of research work.

This engagement is Phase 1 of that programme. It is intended to produce a working, production-grade platform that delivers immediate value while establishing the technical and operational foundations for subsequent phases.

### 2.3 Why This, Why Now

The volume of publicly available content relevant to Nielsen's clients has grown significantly. Analysts are expected to stay current across more sources, more markets, and more topics than in previous years. The current toolset — primarily browser-based search and manual note-taking — has not scaled with this demand.

At the same time, large language model (LLM) technology has matured to the point where automated summarisation, entity extraction, and source comparison produce outputs of sufficient quality for professional research workflows. The risk profile for AI-assisted research has decreased substantially.

CGI's AI Centre of Excellence has assessed the current technology landscape and concluded that now is the right time for Nielsen to invest in this capability.

---

## 3. Current State — As-Is

### 3.1 How Research Currently Works

Nielsen's research analysts follow a broadly consistent process when preparing background research for client deliverables:

1. **Topic identification** — Analyst receives a research brief or identifies a topic independently.
2. **Manual searching** — Analyst uses Google, LinkedIn, Nielsen's internal databases, and industry portals to find relevant sources.
3. **Manual reading** — Analyst reads each source in full and highlights key information.
4. **Manual note-taking** — Analyst extracts entities (company names, people, statistics) by hand into a notes document or spreadsheet.
5. **Cross-referencing** — Analyst manually compares findings across sources, noting where sources agree or contradict.
6. **Summary drafting** — Analyst writes a structured summary of findings for the client deliverable.

### 3.2 Current Pain Points

| Pain Point | Description | Reported Impact |
|-----------|-------------|-----------------|
| **Time spent on reading** | Analysts read source material in full even when only a small portion is relevant | Estimated 30–40% of research preparation time |
| **Inconsistent entity extraction** | No standard method for capturing entities — varies by analyst and project | Inconsistent data quality across deliverables |
| **No structured source comparison** | Agreements and contradictions between sources are noted informally | Contradictions are sometimes missed; rework required |
| **Context-switching cost** | Analysts switch between browser, notes app, spreadsheet, and writing tool | Estimated 15–20% productivity loss due to tool fragmentation |
| **No audit trail** | No record of which sources were considered and how they were assessed | Compliance and quality review challenges |

### 3.3 Current Tools in Use

| Tool | Purpose | Limitation |
|------|---------|-----------|
| Google Search | Finding sources | No summarisation; analyst must read manually |
| Microsoft Word / Google Docs | Note-taking and drafting | No integration with search; manual entry only |
| Microsoft Excel | Entity tracking | Manual; inconsistent across teams |
| Nielsen internal portals | Proprietary data access | No AI layer; separate from external research workflow |
| Email / Slack | Source sharing between analysts | No structure; knowledge lost when people leave |

### 3.4 Baseline Metrics (Pre-Project)

| Metric | Current Value | Source |
|--------|--------------|--------|
| Average time to prepare research brief | 3.5 hours | Nielsen Research Ops team estimate |
| Average number of sources reviewed per brief | 8–12 | Nielsen Research Ops team estimate |
| Proportion of research time spent on reading/summarising | ~38% | Internal time-tracking pilot (Q1 2026) |
| Analyst satisfaction score — research tooling | 52/100 | Nielsen internal pulse survey, March 2026 |

---

## 4. Problem Statement

Nielsen's analysts spend approximately **38% of their research preparation time** on tasks that are mechanical and repeatable — reading web pages, extracting entities, and comparing sources — rather than on the higher-value analysis and interpretation that differentiates Nielsen's work.

This creates three direct business problems:

1. **Capacity constraint** — Senior analysts are spending skilled time on unskilled tasks. This limits the volume of work each analyst can deliver and increases cost per deliverable.

2. **Quality inconsistency** — Because there is no standardised, automated approach to entity extraction or source comparison, output quality varies by analyst, team, and time pressure. This creates risk in client-facing deliverables.

3. **Scaling barrier** — As Nielsen expands into new markets and takes on more clients, the current manual approach does not scale. Adding capacity means hiring, which is expensive and slow.

---

## 5. Business Objectives

The following objectives have been agreed between CGI and Nielsen. Each objective is measurable and will be assessed at project closure.

| ID | Objective | Measurement | Target |
|----|-----------|-------------|--------|
| BO-01 | Reduce time spent on research preparation | Analyst time-tracking | 35% reduction within 3 months of go-live |
| BO-02 | Standardise entity extraction across all research outputs | Consistency audit | 90% of entity fields populated consistently post-go-live |
| BO-03 | Provide analysts with structured source comparison | Adoption tracking | 80% of analysts using compare tool within 6 weeks of go-live |
| BO-04 | Improve analyst tooling satisfaction | Pulse survey | Score of 70+ within 3 months of go-live |
| BO-05 | Establish a reusable AI platform foundation for Phase 2 | Architecture review | Platform extensible without re-architecture (confirmed by Nielsen Engineering) |

---

## 6. Future State — To-Be

### 6.1 The Target Experience

After this project, a Nielsen analyst preparing research on a new topic will:

1. **Search in seconds** — Type a query into Claude Desktop or the Nielsen research portal and receive bullet-point summaries of the top Wikipedia and public web sources within 10–25 seconds, without reading a single article manually.

2. **Extract entities automatically** — Paste any block of text (a press release, a report extract, a news article) and receive a structured list of people, organisations, locations, and key concepts — correctly labelled, with confidence scores — without manual entry.

3. **Compare sources with one action** — Provide 2–6 URLs and receive a structured comparison identifying where sources agree, where they contradict, and what the evidence-based consensus position is.

4. **Summarise any page on demand** — Paste any public URL and receive a concise bullet-point summary in under 15 seconds.

### 6.2 How the Analyst Experience Changes

| Task | Before | After |
|------|--------|-------|
| Summarise a 5,000-word article | Read in full (~20 min) | Paste URL → bullet summary (~10 sec) |
| Extract entities from a press release | Manual entry into spreadsheet (~15 min) | Paste text → structured JSON (~8 sec) |
| Compare two news articles | Read both, manually note differences (~30 min) | Paste 2 URLs → structured comparison (~30 sec) |
| Find background on a topic | Google → read multiple pages (~45 min) | Type query → summaries of top sources (~20 sec) |

### 6.3 Integration Points

The platform will integrate into two existing analyst touchpoints, requiring no new software installations beyond initial configuration:

- **Claude Desktop** — analysts who already use Claude Desktop gain four new research tools automatically via the MCP (Model Context Protocol) integration.
- **Nielsen Research Portal** — an embedded interactive web interface allows analysts without Claude Desktop to access all four tools through a browser, with no login required in Phase 1.

---

## 7. Project Scope

### 7.1 In Scope — Phase 1

| # | Capability | Business Justification |
|---|-----------|------------------------|
| 1 | Automated URL summarisation (any public web page) | Addresses BO-01: reduces manual reading time |
| 2 | Wikipedia-based search with AI-formatted summaries | Addresses BO-01: provides fast background research |
| 3 | Named entity extraction from free text | Addresses BO-02: standardises entity data quality |
| 4 | Multi-source comparison with agreement/contradiction analysis | Addresses BO-03: replaces manual cross-referencing |
| 5 | Interactive web UI accessible from any browser | Ensures adoption by analysts without Claude Desktop |
| 6 | Claude Desktop integration (MCP) | Ensures adoption by analysts already using Claude Desktop |
| 7 | Technical documentation and knowledge transfer | Ensures Nielsen Engineering can maintain the platform post-handover |

### 7.2 Out of Scope — Phase 1

| # | Exclusion | Rationale | Phase |
|---|-----------|-----------|-------|
| 1 | Nielsen SSO / Active Directory integration | Security and identity work scoped separately | Phase 2 |
| 2 | Storage and retrieval of research history | Requires data architecture decisions not in this scope | Phase 2 |
| 3 | Custom Nielsen-branded UI | Design and brand work not required for internal tool | Phase 2 |
| 4 | Integration with Nielsen proprietary databases | Access controls and data governance in scope for Phase 2 | Phase 2 |
| 5 | Custom AI model training or fine-tuning | Not required; Claude Sonnet 4.6 meets the capability bar | Not planned |
| 6 | Real-time streaming responses | Polling approach sufficient for this use case | Phase 2 |
| 7 | Multi-language support | English-language sources only in Phase 1 | Phase 2 |
| 8 | Mobile application | Analysts work primarily on desktops | Phase 2 |

---

## 8. Stakeholders

### 8.1 Stakeholder Register

| ID | Name | Role | Organisation | Interest | Influence | Engagement |
|----|------|------|--------------|----------|-----------|------------|
| S1 | TBD | VP Analytics | Nielsen | Programme sponsor, budget owner | High | Approve |
| S2 | TBD | Director, Research Operations | Nielsen | Day-to-day requirements, UAT lead | High | Approve |
| S3 | TBD | Engineering Lead | Nielsen | Infrastructure, security sign-off | Medium | Review |
| S4 | TBD | Research Analyst (x3) | Nielsen | End users, UAT participants | Low | Consult |
| S5 | TBD | Engagement Manager | CGI | Delivery accountability | High | Own |
| S6 | TBD | Solution Architect | CGI | Technical design | High | Own |
| S7 | TBD | Senior Developer | CGI | Build delivery | Medium | Own |
| S8 | TBD | QA Engineer | CGI | Test quality | Medium | Own |

### 8.2 Stakeholder Communication Plan

| Audience | Format | Frequency | Owner |
|----------|--------|-----------|-------|
| Nielsen VP Analytics | Executive status report | Fortnightly | CGI Engagement Manager |
| Nielsen Research Operations | Requirements review meeting | Weekly | CGI Engagement Manager |
| Nielsen Engineering | Technical review meeting | Weekly | CGI Solution Architect |
| All stakeholders | Milestone demo | End of Weeks 4, 8, 10 | CGI Engagement Manager |
| Nielsen Analysts | UAT session | Week 9 | CGI QA + Nielsen Research Ops |

---

## 9. Business Requirements

Business requirements describe **what the business needs** — not how the system will be built. Each requirement is traceable to a business objective.

---

### BR-01 — Web Content Summarisation

| | |
|---|---|
| **ID** | BR-01 |
| **Title** | Web Content Summarisation |
| **Business Objective** | BO-01 |
| **Priority** | Must Have |
| **Statement** | An analyst must be able to provide any publicly accessible web page address and receive a concise, structured summary of the page's content without reading the page themselves. |
| **Business Rationale** | Analysts currently spend 20–40 minutes reading each source article in full. A reliable summarisation capability reduces this to under 15 seconds, directly addressing the core time-consumption problem. |
| **Acceptance Condition** | An analyst who has never seen a given article can accurately answer 3 of 4 factual questions about it using only the generated summary. |
| **Constraints** | The page must be publicly accessible (no login required). The summary must be in English. |
| **Out of Scope** | Summarisation of PDF files, paywalled content, or authenticated pages is excluded from Phase 1. |

---

### BR-02 — Research Topic Search

| | |
|---|---|
| **ID** | BR-02 |
| **Title** | Research Topic Search |
| **Business Objective** | BO-01 |
| **Priority** | Must Have |
| **Statement** | An analyst must be able to enter a topic or query in plain English and receive a ranked list of relevant sources, each accompanied by a brief summary, without manually searching and reading multiple web pages. |
| **Business Rationale** | Background research for a new topic currently requires 30–60 minutes of manual searching and reading. A search capability that surfaces and summarises relevant sources in under 25 seconds eliminates the majority of this time. |
| **Acceptance Condition** | For any topic relevant to Nielsen's business (media, FMCG, market data, major companies, geographies), the top result returned is relevant to the query, and the summary accurately reflects that article's content. |
| **Constraints** | Search results are sourced from Wikipedia in Phase 1. Proprietary or paywalled database search is Phase 2. |
| **Out of Scope** | Real-time news search, social media monitoring, and Nielsen internal database search are excluded from Phase 1. |

---

### BR-03 — Named Entity Extraction

| | |
|---|---|
| **ID** | BR-03 |
| **Title** | Named Entity Extraction |
| **Business Objective** | BO-02 |
| **Priority** | Must Have |
| **Statement** | An analyst must be able to paste a block of unstructured text and receive a structured list of named entities — including people, organisations, locations, and key concepts — extracted consistently and in a standardised format. |
| **Business Rationale** | Entity extraction is currently done manually and inconsistently across teams. Standardising this with AI eliminates data quality issues and saves approximately 15 minutes per document. |
| **Acceptance Condition** | When tested against a sample Nielsen press release: (a) no named organisations are missed, (b) no named individuals are missed, (c) entities are labelled correctly as person, organisation, or location. Assessed by Nielsen Research Operations team during UAT. |
| **Constraints** | Input text must be in English. Maximum input length is 40,000 characters per request. |
| **Out of Scope** | Entity extraction from PDF, image, or audio content is excluded from Phase 1. |

---

### BR-04 — Multi-Source Comparison

| | |
|---|---|
| **ID** | BR-04 |
| **Title** | Multi-Source Comparison |
| **Business Objective** | BO-03 |
| **Priority** | Must Have |
| **Statement** | An analyst must be able to provide between 2 and 6 web page addresses and receive a structured comparison identifying: what the sources agree on, where they contradict each other, and an overall consensus position. |
| **Business Rationale** | Manual cross-referencing of multiple sources takes 30–60 minutes and is prone to human error. Structured automated comparison both saves time and reduces the risk of missed contradictions in client-facing work. |
| **Acceptance Condition** | When tested with two news articles covering the same topic from opposing viewpoints, the comparison output correctly identifies at least one factual agreement and at least one factual contradiction. Assessed by Nielsen Research Operations during UAT. |
| **Constraints** | All source URLs must be publicly accessible. Minimum 2 sources required; maximum 6. |
| **Out of Scope** | Comparison of documents not hosted on public URLs (e.g., local files, internal Nielsen reports) is Phase 2. |

---

### BR-05 — Browser-Based Access

| | |
|---|---|
| **ID** | BR-05 |
| **Title** | Browser-Based Access |
| **Business Objective** | BO-04 |
| **Priority** | Should Have |
| **Statement** | All four research capabilities must be accessible through a standard web browser without any software installation, account creation, or login. |
| **Business Rationale** | Adoption is critical to realising business value. Requiring analysts to install new software or create accounts creates friction that reduces adoption. A browser-based interface removes these barriers. |
| **Acceptance Condition** | A Nielsen analyst with no prior knowledge of the system can access and successfully use all four tools using only a web browser and the system URL, within 5 minutes of first access, without any guidance from CGI. |
| **Constraints** | The interface must work in the standard Nielsen browser environment (Chrome, Edge). |
| **Out of Scope** | Nielsen SSO integration and user session persistence are Phase 2. |

---

### BR-06 — Claude Desktop Integration

| | |
|---|---|
| **ID** | BR-06 |
| **Title** | Claude Desktop Integration |
| **Business Objective** | BO-04 |
| **Priority** | Must Have |
| **Statement** | Analysts who use Claude Desktop must be able to invoke all four research tools directly within that environment, using natural language, without switching to a separate application. |
| **Business Rationale** | Claude Desktop is already used by a proportion of Nielsen's analyst team. Providing native integration means these users get the full benefit without any change to their existing workflow — maximum value for minimum friction. |
| **Acceptance Condition** | Following a one-time configuration step (estimated under 5 minutes), a Nielsen analyst can type a natural language research request in Claude Desktop and receive a structured research response from any of the four tools, without leaving the Claude Desktop application. |
| **Constraints** | Analyst must have Claude Desktop installed and have been provided with an Anthropic API key. |
| **Out of Scope** | Automated provisioning of Anthropic API keys to Nielsen analysts is Phase 2. |

---

### BR-07 — Service Reliability

| | |
|---|---|
| **ID** | BR-07 |
| **Title** | Service Reliability |
| **Business Objective** | BO-05 |
| **Priority** | Must Have |
| **Statement** | The platform must be reliable enough for professional daily use. Individual request failures must not require analyst intervention beyond retrying the request. System unavailability must be the exception, not the norm. |
| **Business Rationale** | If analysts cannot trust the platform to return a result when they need it, they will revert to manual methods and adoption will fail. Reliability is a prerequisite for sustained usage. |
| **Acceptance Condition** | (a) No single failing source URL causes the entire comparison request to fail — partial results are returned. (b) Transient failures are retried automatically without user involvement. (c) When the service is unavailable, the error message clearly states this rather than displaying a technical error. |
| **Constraints** | Service is hosted on cloud infrastructure; Anthropic API availability is an external dependency outside Nielsen's and CGI's control. |
| **Out of Scope** | 99.9% SLA is not required for Phase 1 (free-tier hosting). A production SLA is a Phase 2 concern. |

---

### BR-08 — Audit Transparency

| | |
|---|---|
| **ID** | BR-08 |
| **Title** | Audit Transparency |
| **Business Objective** | BO-05 |
| **Priority** | Should Have |
| **Statement** | Every research output must include a reference to the source URL from which it was derived, so analysts can verify, cite, or further investigate the source. |
| **Business Rationale** | Nielsen's deliverables must be evidence-based and auditable. If an AI-generated summary is included in a client report, Nielsen analysts must be able to trace it back to the primary source. |
| **Acceptance Condition** | Every summary, entity extraction, and comparison result includes the URL of the source content from which it was generated. |
| **Constraints** | None. |
| **Out of Scope** | Integration with Nielsen's formal citation management system is Phase 2. |

---

## 10. Business Rules

Business rules are non-negotiable conditions that govern how the platform must operate regardless of technical implementation choices.

| ID | Rule | Source |
|----|------|--------|
| BRU-01 | Anthropic API keys must never be stored in source code, version control, or logs | Nielsen Information Security Policy |
| BRU-02 | The platform must not store, cache, or persist any analyst query text or research outputs | Nielsen Data Governance Policy — Phase 1 |
| BRU-03 | All source URLs used in research must be publicly accessible — no credentials may be forwarded to third-party sites | Nielsen Information Security Policy |
| BRU-04 | The platform must not process or transmit Nielsen proprietary data to external AI APIs in Phase 1 | Nielsen Data Governance Policy |
| BRU-05 | Error messages shown to analysts must never contain internal technical details (stack traces, file paths, server configuration) | Nielsen Information Security Policy |
| BRU-06 | The platform must not make any financial transactions or send communications on behalf of Nielsen | Scope constraint |
| BRU-07 | The platform must return a response (either results or a clear error message) within 30 seconds for all requests | Nielsen UX Standards |

---

## 11. Business Process Flows

### 11.1 As-Is: Manual Research Preparation (Current State)

```
Analyst receives research brief
        │
        ▼
Analyst searches Google / industry portals
        │
        ▼
Analyst opens each source and reads in full
(30–90 minutes for 6–10 sources)
        │
        ▼
Analyst manually types key facts into notes document
        │
        ▼
Analyst manually identifies entity names (people, orgs, places)
and enters into spreadsheet
        │
        ▼
Analyst manually compares notes across sources
and writes up agreements / contradictions
        │
        ▼
Analyst writes summary for client deliverable
(1–2 hours per brief)
```

---

### 11.2 To-Be: AI-Assisted Research Preparation (Future State)

```
Analyst receives research brief
        │
        ▼
Analyst types topic into Claude Desktop or research portal
        │
        ▼
Platform returns top Wikipedia sources with
bullet-point summaries (< 25 seconds)
        │
        ├─── Analyst pastes relevant text into Extract Entities
        │    Platform returns structured entity list (< 10 seconds)
        │
        ├─── Analyst pastes 2–6 source URLs into Compare Sources
        │    Platform returns agreements / contradictions (< 45 seconds)
        │
        └─── Analyst pastes specific URLs into Summarize URL
             Platform returns focused summaries (< 15 seconds)
                        │
                        ▼
             Analyst reviews and validates AI outputs
             (10–15 minutes vs 60–90 minutes previously)
                        │
                        ▼
             Analyst writes client deliverable
             using structured AI-generated inputs
```

---

### 11.3 Process Improvement Summary

| Process Step | As-Is Time | To-Be Time | Saving |
|-------------|-----------|-----------|--------|
| Background search and reading | 30–60 min | 25 sec | ~55 min |
| Entity extraction | 15–30 min | 8 sec | ~25 min |
| Source comparison | 30–60 min | 45 sec | ~55 min |
| Targeted article summary | 20–30 min | 10 sec | ~25 min |
| **Total research preparation** | **~3.5 hours** | **~1.2 hours** | **~2.3 hours (65%)** |

---

## 12. Assumptions & Constraints

### 12.1 Assumptions

| ID | Assumption | Owner | Impact if Wrong |
|----|-----------|-------|-----------------|
| A1 | Nielsen will provide a valid Anthropic API key with sufficient quota for production usage | Nielsen | Core AI functionality unavailable |
| A2 | The production hosting environment has outbound HTTPS access to api.anthropic.com and en.wikipedia.org | Nielsen Engineering | Platform cannot call AI API or search tool |
| A3 | Nielsen analysts use Claude Desktop (Mac or Windows) for the MCP integration | Nielsen | MCP integration unusable; REST API still works |
| A4 | Nielsen's internal security review approves the use of the Anthropic API for processing non-proprietary research data | Nielsen | Deployment blocked pending security clearance |
| A5 | The Nielsen Product Owner will be available for weekly review meetings and UAT participation | Nielsen | Requirements misalignment; delayed sign-off |
| A6 | Nielsen's GitHub organisation will host the repository after handover | Nielsen | Post-handover maintenance requires alternative arrangement |
| A7 | Phase 1 user base is English-language analysts only | Nielsen Research Ops | Multi-language requirement needs to be rescoped |

### 12.2 Constraints

| ID | Constraint | Type | Impact |
|----|-----------|------|--------|
| C1 | All AI processing uses Anthropic Claude Sonnet 4.6 — no custom model training in Phase 1 | Technical | Capability bounded by Claude's out-of-the-box performance |
| C2 | Search is limited to Wikipedia in Phase 1 — no general web search | Scope | Breadth of search results limited to Wikipedia's coverage |
| C3 | Platform does not store data — stateless per-request processing only | Data Governance | No search history, no saved results in Phase 1 |
| C4 | Phase 1 hosting uses Render free/Pro tier — not enterprise-grade infrastructure | Budget | 99.9% SLA not achievable on free tier |
| C5 | Phase 1 must be delivered within 10 weeks from contract signature | Schedule | Scope changes after Week 5 may be deferred to Phase 2 |
| C6 | Platform must not process Nielsen proprietary or client-confidential data | Data Governance | Analysts must use only publicly available sources in Phase 1 |

---

## 13. Dependencies

| ID | Dependency | Owner | Risk if Unavailable |
|----|-----------|-------|---------------------|
| D1 | Anthropic Claude Sonnet 4.6 API | Anthropic | Summarisation, extraction, and comparison unavailable. Fallback: queue requests until API restored |
| D2 | Wikipedia Search API (en.wikipedia.org/w/api.php) | Wikimedia Foundation | Search tool returns empty results. Other three tools unaffected |
| D3 | Wikipedia REST Summary API (en.wikipedia.org/api/rest_v1) | Wikimedia Foundation | Search tool falls back to full-page fetch (slower). Results still available |
| D4 | Render hosting platform | Render | Replace with AWS or Fly.io — 1–2 days migration |
| D5 | GitHub Actions CI/CD | GitHub | Manual builds required — development continues unaffected |
| D6 | Claude Desktop (analyst machines) | Anthropic | MCP integration unavailable. REST API and browser UI unaffected |
| D7 | Nielsen ANTHROPIC_API_KEY provisioning | Nielsen | Development and testing blocked until key is provided. CGI to provide temporary key for development |

---

## 14. Success Criteria & Benefits Realisation

### 14.1 Go-Live Acceptance Criteria

The project will be considered complete when all of the following are met and signed off by the Nielsen Product Owner:

| # | Criterion | How Verified |
|---|-----------|--------------|
| SC-01 | All four research tools return correct outputs for the test cases agreed with Nielsen Research Operations during UAT | Nielsen Product Owner sign-off following UAT |
| SC-02 | The browser-based interface presents all four tools and renders results in a readable, formatted layout | Visual inspection by Nielsen Research Operations during UAT |
| SC-03 | Claude Desktop integration works end-to-end for a Nielsen analyst using the provided configuration instructions | Tested by Nielsen analyst during UAT |
| SC-04 | The platform handles invalid inputs gracefully — returning a clear, plain-English error rather than a technical error or crash | Testing by CGI QA during Week 8 |
| SC-05 | All technical documentation (README, deployment guide, contributing guide) is reviewed and accepted by Nielsen Engineering | Nielsen Engineering Lead sign-off |
| SC-06 | Knowledge transfer session has been delivered — Nielsen Engineering team can explain how to deploy and maintain the platform | Session completed; confirmed by Nielsen Engineering Lead |

### 14.2 Business Benefits — 3-Month Post Go-Live Review

CGI recommends Nielsen conducts a formal benefits review 3 months after go-live, measuring:

| Metric | Baseline (Pre-Project) | Target (3 Months Post Go-Live) |
|--------|----------------------|-------------------------------|
| Average research preparation time per brief | 3.5 hours | 1.2 hours |
| Analyst tooling satisfaction score | 52 / 100 | 70+ / 100 |
| % of research briefs using entity extraction | ~0% | 75%+ |
| % of analysts using the platform at least weekly | 0% | 80%+ |
| Number of research briefs delivered per analyst per week | Baseline TBD | 30% increase |

### 14.3 Strategic Value — Foundations for Phase 2

Beyond the direct measurable benefits, Phase 1 delivers the following strategic value:

- **A production-grade AI platform** that Nielsen Engineering can extend without re-architecture
- **An established MCP integration pattern** that can be used for future AI tools
- **Validated AI research workflows** that can be replicated across other Nielsen business units
- **Organisational confidence** in AI-assisted research as a reliable, auditable practice

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| **AI** | Artificial Intelligence — in this document, specifically the Anthropic Claude large language model |
| **BRD** | Business Requirements Document — this document |
| **Claude Desktop** | Anthropic's desktop application for interacting with the Claude AI model |
| **Entity Extraction** | The automated identification and classification of named objects in text (people, organisations, locations, concepts) |
| **FSD** | Functional Specification Document — the detailed functional specification, produced by CGI after BRD approval |
| **LLM** | Large Language Model — an AI model trained on large volumes of text, capable of summarisation, classification, and generation |
| **MCP** | Model Context Protocol — an open standard developed by Anthropic that allows AI applications to use external tools via a defined interface |
| **MCP Server** | A software process that implements the MCP protocol and exposes tools to an MCP-compatible AI application such as Claude Desktop |
| **NFR** | Non-Functional Requirement — a requirement relating to system quality (performance, reliability, security) rather than a specific capability |
| **Nielsen Research Portal** | Nielsen's internal web-based research tooling (existing system — not built by this project) |
| **Phase 1** | The scope of this engagement — four research tools, REST API, MCP integration, browser UI, cloud deployment |
| **Phase 2** | Planned future work — SSO integration, data persistence, proprietary database search, multi-language support |
| **SDD** | Software Design Document — the technical architecture and design specification, produced by CGI after FSD approval |
| **SOW** | Statement of Work — the commercial document defining project scope, timelines, and costs |
| **UAT** | User Acceptance Testing — the process by which Nielsen analysts validate that the delivered system meets their requirements |
| **Wikipedia API** | The public API provided by the Wikimedia Foundation for searching and retrieving Wikipedia article content |

---

## 16. Sign-Off

By signing this document, the parties confirm that the business requirements described herein are complete, understood, and agreed as the basis for the Phase 1 engagement.

Any changes to these requirements after sign-off must follow the agreed Change Request process documented in the Statement of Work.

---

### Nielsen — Product Owner

| | |
|---|---|
| **Name** | |
| **Title** | Director, Research Operations |
| **Signature** | |
| **Date** | |

---

### Nielsen — Project Sponsor

| | |
|---|---|
| **Name** | |
| **Title** | VP Analytics |
| **Signature** | |
| **Date** | |

---

### CGI — Engagement Manager

| | |
|---|---|
| **Name** | |
| **Title** | Engagement Manager — Digital & AI Practice |
| **Signature** | |
| **Date** | |

---

*This document is confidential and intended solely for use by CGI Inc. and The Nielsen Company.
Any reproduction or distribution outside these parties requires prior written consent from both parties.*

*CGI Inc. · The Nielsen Company · Project Code: CGI-NIE-2026-AI-001 · BRD Version 1.0*
