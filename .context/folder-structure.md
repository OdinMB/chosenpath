# Folder structure

## Client

- The client has two orthoganal aspects: context and resources (that can behave differently depending on context)
- The contexts are: admin, game, page, users. Files to manage these contexts go to client/src/CONTEXT. We have set up directory aliases. To import from the admin context, you can import from 'admin/adminApi'.
- Resources are things like templates, stories, etc. Files go to client/src/resources/RESOURCE. To import from the stories resource, import from 'stories/components/...'.
- Client files that are relevant to several parts of the frontend go to client/src/shared. (Import from 'shared/...')

client/src/
├── admin/ # Admin-specific components/pages
│ ├── components/
│ ├── system/ # The System page (/admin/system): client-address check, AI spend
│ ├── adminApi.ts
│ ├── adminRoutes.ts
│ └── ...
├── users/ # User account area components/pages
│ ├── components/
│ ├── hooks/
│ ├── stories/ # My Stories, the archive, printable seat cards (/users/seat-cards)
│ ├── usersRoutes.tsx
│ └── ...
├── page/ # Public pages
│ ├── utils/ # e.g. joinByCode.ts: the home page's join-form code check
│ └── ...
├── resources/ # Feature modules used across contexts
│ ├── templates/ # Template functionality (used in both admin & user)
│ │ ├── components/
│ │ │ └── ...
│ │ ├── hooks/
│ │ │ └── ...
│ │ └── pages/
│ │ ├── AdminTemplatesPage.tsx # Admin context wrapper
│ │ └── UserTemplatesPage.tsx # User context wrapper
│ ├── stories/
│ │ ├── components/
│ │ └── ...
│ └── ...
├── shared/ # Shared utilities and components
│ ├── components/ # UI components used everywhere
│ ├── hooks/ # General purpose hooks
│ ├── utils/ # Utility functions
│ └── ...
├── routes.tsx # Application routes
└── App.tsx # Main application component

## Server

- The server side is organized based on resources. Resources include templates, stories, newsletter, etc. Files that are only relevant to a particular resource go to client/src/RESOURCE.
- Some resources have directory aliases. To import server files in game/shared/users, you can import from 'RESOURCE/...'
- Server files that are relevant to several resources go to server/src/shared. (Import from 'shared/...")

server/src/
├── templates/
│ ├── templateRoutes.ts
│ ├── templateService.ts
│ └── ...
├── spend/ # AI spend ledger: the price table, the spend_daily store, the daily ceilings
├── system/ # Admin System routes (/admin/system/connection, /admin/system/spend)
├── shared/
│ ├── clientAddress.ts # The visitor's address for every per-address limit (TRUST_PROXY)
│ ├── db.ts
│ ├── limitPolicy.ts # Who a story start or a choice is counted against
│ ├── logger.ts
│ ├── rateLimiter.ts
│ ├── responseUtils.ts
│ ├── storageUtils.ts
│ └── ...
├── evals/ # Offline eval CLIs (npm run eval:*): type-checked and linted with the server, never imported by the app (ESLint rejects such imports)
├── scripts/ # CLIs run by hand, never started by the app: one-off maintenance (npm run backfill:*) and the local dev database seed (npm run seed:dev, .context/storage.md)
├── config.ts
├── routes.ts

## Core

- Things that are relevant for both client and server go to the core directory. This is especially relevant for types and some utils. (Import from 'core/...', e.g. 'core/types')
