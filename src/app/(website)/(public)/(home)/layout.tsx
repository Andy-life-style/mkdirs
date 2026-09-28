import Container from "@/components/container";
import { HomeCategoryList } from "@/components/home/home-category-list";
import HomeHero from "@/components/home/home-hero";
import { HomeSearchFilter } from "@/components/home/home-search-filter";
import { HomeSidebarExtras } from "@/components/home/home-sidebar-extras";
import { NewsletterCard } from "@/components/newsletter/newsletter-card";

export default function HomeLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <Container className="mt-12 mb-16 flex flex-col gap-12">
      <HomeHero />

      <div className="flex flex-col md:flex-row gap-8">
        {/* left sidebar: categories, tags, collections, and submission */}
        <aside
          aria-label="Browse apps"
          className="hidden md:block w-[250px] flex-shrink-0"
        >
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain space-y-6 pr-2 pb-2">
            <HomeCategoryList urlPrefix="/" />
            <HomeSidebarExtras />
          </div>
        </aside>

        {/* right content: item grid */}
        <div className="flex-1">
          <div className="flex flex-col gap-8">
            <HomeSearchFilter urlPrefix="/" />
            {children}
          </div>
        </div>
      </div>

      <NewsletterCard />
    </Container>
  );
}
