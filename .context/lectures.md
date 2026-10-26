Make sure that lecture pages are in sync with [sitemap.xml](mdc:client/public/sitemap.xml).

`client/tests/unit/page/sitemap.test.ts` enforces it: it fails when a lecture in `lectureData.ts`, or a page route with a fixed address that `robots.txt` doesn't disallow, is missing from the sitemap, and when the sitemap lists anything else.
