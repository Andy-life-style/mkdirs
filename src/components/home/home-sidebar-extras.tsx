import { Button } from "@/components/ui/button";
import type {
  CollectionListQueryResult,
  TagListQueryResult,
} from "@/sanity.types";
import { sanityFetch } from "@/sanity/lib/fetch";
import { collectionListQuery, tagListQuery } from "@/sanity/lib/queries";
import Link from "next/link";

export async function HomeSidebarExtras() {
  const [tags, collections] = await Promise.all([
    sanityFetch<TagListQueryResult>({ query: tagListQuery }),
    sanityFetch<CollectionListQueryResult>({ query: collectionListQuery }),
  ]);
  // Keep the existing query order; no popularity metric is available.
  const popularTags = tags.slice(0, 12);

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="sidebar-tags-heading"
        className="rounded-lg border p-4"
      >
        <h2 id="sidebar-tags-heading" className="mb-3 text-sm font-semibold">
          Popular Tags
        </h2>
        <ul className="flex flex-wrap gap-2">
          {popularTags.map((tag) => (
            <li key={tag._id}>
              <Link
                href={`/?tag=${encodeURIComponent(tag.slug.current)}`}
                className="inline-block rounded-md bg-muted px-2 py-1 text-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {tag.name}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/tag"
          className="mt-3 inline-block text-sm text-primary hover:underline"
        >
          View all tags
        </Link>
      </section>

      <section
        aria-labelledby="sidebar-collections-heading"
        className="rounded-lg border p-4"
      >
        <h2
          id="sidebar-collections-heading"
          className="mb-3 text-sm font-semibold"
        >
          Collections
        </h2>
        <ul className="space-y-1">
          {collections.map((collection) => (
            <li key={collection._id}>
              <Link
                href={`/collection/${encodeURIComponent(collection.slug.current)}`}
                className="block rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {collection.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="sidebar-submit-heading"
        className="rounded-lg border bg-muted/50 p-4"
      >
        <h2 id="sidebar-submit-heading" className="font-semibold">
          Submit Your Shopify App
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Help Shopify merchants discover your app.
        </p>
        <Button asChild className="mt-4 w-full">
          <Link href="/submit">Submit Your App</Link>
        </Button>
      </section>
    </div>
  );
}
