# Website Updates for Open-Source Launch

## Summary
Frontend-only changes to reflect AGPL-3.0 open-source status, add Ko-fi support links, create Stewardship and For Therapists pages, and make professional landing pages more prominent.

## Files to Create
1. `client/src/page/static/Stewardship.tsx` — Professional page for institutional adoption/stewardship
2. `client/src/page/static/ForTherapists.tsx` — Landing page following ForEducators/ForCoaches pattern

## Files to Modify
1. `client/src/page/static/Privacy.tsx` — Add "Open Source & License" section
2. `client/src/page/static/Credits.tsx` — Add AGPL-3.0 note
3. `client/src/page/Page.tsx` — Open-source mention + professional audience cards + bridge sentence
4. `client/src/page/components/Footer.tsx` — Ko-fi button/icon, Stewardship link, For Therapists button, professional button styling
5. `client/src/page/pageRoutes.tsx` — Add Stewardship and ForTherapists routes
6. `client/src/shared/components/ui/Icons.tsx` — Add Ko-fi/Heart icon

## Implementation Order
1. Add Ko-fi icon to Icons.tsx (dependency for Footer)
2. Modify Footer.tsx (Ko-fi, Stewardship, For Therapists, professional styling)
3. Modify Privacy.tsx (license section)
4. Modify Credits.tsx (open-source note)
5. Create Stewardship.tsx
6. Create ForTherapists.tsx
7. Modify Page.tsx (open-source mention, bridge sentence, professional cards)
8. Modify pageRoutes.tsx (add routes)
9. Run checks
