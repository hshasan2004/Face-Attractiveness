# FaceValue Project - Overall Statement of Features

Date: April 18, 2026

## 1. Project Purpose and Scope

FaceValue is a web-based research platform designed to collect structured human attractiveness ratings for celebrity photos. It is targeted for evaluator participation in Bangladesh and supports both participant-facing and administrator-facing workflows. The platform combines controlled survey execution, dynamic content management, analytics, and gamification. The technical stack is React (Vite) on the frontend, Supabase for authentication/database/storage/realtime, and Firebase Hosting for deployment.

## 2. End-User (Evaluator) Features

1. Account creation and sign-in with email/password authentication.
2. Input validation and eligibility checks during registration, including strong password rules and age limits.
3. Research rules page before participation with guidance for consistency and bias reduction.
4. Photo rating workflow with 1 to 5 star scoring.
5. Dynamic loading of photos from the active survey in database-backed sequence.
6. Anti-pattern selection behavior to avoid undesirable repeated photo sequences from the same celebrity.
7. Resume-capable survey sessions so a participant can continue later from saved progress.
8. Detection of newly added unrated photos and continued participation support.
9. Mandatory break mechanic after defined rating intervals to reduce fatigue effects.
10. Countdown-based break interface with delayed skip availability.
11. Responsive image delivery and quality transformation based on device/network profile.
12. Completion screen with final submission summary and sign-out option.
13. Persistent top navigation for account context and quick actions.
14. Dedicated rewards page displaying participant progress and recognition.
15. Points accumulation model tied to rating activity and milestones.
16. Tier progression model (Bronze, Silver, Gold, Platinum) with threshold-based advancement.
17. Achievement unlocking framework with predefined badge catalog.
18. User leaderboard visibility for top participants.
19. Reward transaction history visibility for transparency.

## 3. Admin and Research Operations Features

1. Separate admin login route and role-protected admin access.
2. Protected routing and role checks to isolate privileged tools.
3. Survey creation with metadata controls (title, description, session image count, evaluator targets).
4. Survey lifecycle management with draft, active, and closed states.
5. Single-active-survey enforcement to preserve operational consistency.
6. Survey list management and status toggling.
7. Multi-step survey creation wizard for guided setup.
8. Draft state persistence for interrupted admin setup sessions.
9. Celebrity profile creation with demographic metadata (for example, gender).
10. Photo upload pipeline to map images to specific survey and celebrity records.
11. Image cropping/editing interface in upload flow with multiple aspect ratio options.
12. In-context photo management from celebrity management interfaces.
13. Profile image support for celebrity records and leaderboard presentation.
14. Photo count and upload progress cues for completion tracking.
15. Admin dashboard with live operational and participation metrics.
16. Real-time participant breakdown views, including gender and age distribution.
17. Real-time ratings and activity totals.
18. Leaderboard and ranking views for rated celebrities.
19. Results page with sorting and filtering controls.
20. Rating distribution visualizations.
21. Participant-level statistics and activity timelines.
22. CSV export for downstream analysis and reporting.
23. Built-in DB setup/help page that includes schema and policy references.

## 4. Data, Backend, Security, and Realtime Capabilities

1. Supabase Auth integration for session-based authentication.
2. Supabase PostgreSQL schema covering surveys, celebrities, photos, profiles, assignments, ratings, responses, and rewards.
3. Extended rewards schema including tiers, achievements, user rewards, and transactions.
4. SQL function support for role checks, reward assignment logic, tier updates, and unrated-photo queries.
5. Row-Level Security (RLS) policy model across core data domains.
6. User-specific visibility controls on personal data and actions.
7. Admin-specific elevated visibility/control for research operations.
8. Public-read and admin-write patterns on selected catalog content where appropriate.
9. Realtime subscriptions for key tables to keep analytics pages current.
10. Performance indexing migrations for major query paths.
11. Client-side query optimization and cache behavior for repeated reads.
12. Retry and timeout behavior in selected authentication and loading flows.
13. Compatibility handling for legacy schema variants in profile data paths.
14. Controlled fallback behavior where optional newer tables are not yet present.

## 5. Storage, Media, and Delivery

1. Supabase Storage bucket strategy for celebrity photos.
2. Environment-configurable bucket naming.
3. Public URL delivery for display surfaces.
4. Transformed image URL usage for bandwidth and quality tuning.
5. Upload error handling for missing bucket/configuration scenarios.

## 6. Setup, Migration, and Operational Tooling

1. SQL bootstrap/setup scripts for full environment initialization.
2. Migration files for dynamic survey enhancements and response model evolution.
3. Migration files for profile image support and related fixes.
4. Migration files for RLS repairs and admin content permissions.
5. Migration files for performance indexes.
6. Multiple setup pathways for rewards (manual SQL, Node.js automation, Python utility).
7. Dedicated migration runner/apply scripts for operational execution.
8. Scripted validation/test utilities for auth, profiles, admin behavior, and Supabase connectivity.

## 7. Deployment and Runtime Configuration

1. Vite-based build pipeline and frontend app bundling.
2. Firebase Hosting configuration and deployment scripts.
3. Environment-variable-based Supabase endpoint and key wiring.
4. Configurability for storage bucket integration.

## 8. Known Constraints and Documented Limitations

1. Operational model expects one active survey at a time.
2. Some features require one-time schema migrations before use (for example, profile image support).
3. Legacy database variants may require compatibility fallbacks.
4. Rewards system requires explicit setup of reward tables/functions.
5. Certain historical schema constraints can block survey creation if not aligned.
6. Registration currently enforces an age range constraint.
7. Enhanced dynamic-survey additions include documented future opportunities not yet fully implemented (for example, richer notification behaviors and additional continuation UX).

## 9. Summary Statement

FaceValue is a full-stack, production-oriented research survey platform with a complete evaluator journey, robust admin control plane, real-time analytics, secure role-based data governance, dynamic survey continuity, and a gamified engagement layer. The project includes substantial migration/setup tooling, compatibility handling for evolving schema states, and deployment-ready infrastructure, making it suitable for controlled data collection, iterative research operations, and maintainable long-term extension.
